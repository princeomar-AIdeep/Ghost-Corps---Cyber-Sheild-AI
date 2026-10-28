import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { createWorkspaceFilesApi } from './workspaceFilesApi.js';

const workspaceFilesApi = createWorkspaceFilesApi(apiRequest);

function errorMessage(error) {
  return error instanceof Error ? error.message : 'Workspace file request failed.';
}

export function useWorkspaceFiles({ projects = [], projectsLoading = false, token }) {
  const [projectId, setProjectId] = useState('');
  const [fileList, setFileList] = useState({ projectId: '', files: [], tree: [], loading: false, error: '' });
  const [activeFile, setActiveFile] = useState(null);
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [status, setStatus] = useState(null);
  const projectIdRef = useRef('');
  const listAbortRef = useRef(null);
  const readAbortRef = useRef(null);
  const listRequestRef = useRef(0);
  const readRequestRef = useRef(0);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const isDirty = Boolean(
    activeFile &&
    activeFile.projectId === projectId &&
    content !== savedContent
  );
  const projectAvailable = projects.some((project) => project._id === projectId);

  const confirmDiscard = useCallback(() => (
    !isDirty || window.confirm('Discard unsaved file changes?')
  ), [isDirty]);

  const refreshFiles = useCallback(async (requestedProjectId = projectId) => {
    if (!requestedProjectId || !projectsRef.current.some((project) => project._id === requestedProjectId)) return;
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    const requestId = ++listRequestRef.current;
    setFileList((current) => ({
      projectId: requestedProjectId,
      files: current.projectId === requestedProjectId ? current.files : [],
      tree: current.projectId === requestedProjectId ? current.tree : [],
      loading: true,
      error: '',
    }));

    try {
      const result = await workspaceFilesApi.list(requestedProjectId, { signal: controller.signal, token });
      if (
        controller.signal.aborted ||
        requestId !== listRequestRef.current ||
        projectIdRef.current !== requestedProjectId ||
        !projectsRef.current.some((project) => project._id === requestedProjectId)
      ) return;
      setFileList({
        projectId: requestedProjectId,
        files: result.files,
        tree: result.tree,
        loading: false,
        error: '',
      });
    } catch (error) {
      if (controller.signal.aborted || requestId !== listRequestRef.current || projectIdRef.current !== requestedProjectId) return;
      setFileList({ projectId: requestedProjectId, files: [], tree: [], loading: false, error: errorMessage(error) });
    }
  }, [projectId, token]);

  useEffect(() => {
    if (!projectsLoading && !projectId) {
      const nextId = projectsRef.current[0]?._id || '';
      if (nextId) {
        projectIdRef.current = nextId;
        setProjectId(nextId);
      }
    }
  }, [projects, projectsLoading, projectId]);

  useEffect(() => {
    if (projectId && !projectAvailable) {
      readAbortRef.current?.abort();
      readRequestRef.current += 1;
      setFileLoading(false);
    }
  }, [projectAvailable, projectId]);

  useEffect(() => {
    if (projectId && projectAvailable) refreshFiles(projectId);
    return () => {
      listAbortRef.current?.abort();
      listRequestRef.current += 1;
    };
  }, [projectId, projectAvailable, refreshFiles]);

  useEffect(() => () => {
    readAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!isDirty) return undefined;
    const preventUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [isDirty]);

  const selectProject = useCallback((nextProjectId) => {
    if (nextProjectId === projectId || busyAction) return false;
    if (!projectsRef.current.some((project) => project._id === nextProjectId)) return false;
    if (!confirmDiscard()) return false;

    projectIdRef.current = nextProjectId;
    readAbortRef.current?.abort();
    readRequestRef.current += 1;
    setProjectId(nextProjectId);
    setActiveFile(null);
    setContent('');
    setSavedContent('');
    setFileLoading(false);
    setFileError('');
    setStatus(null);
    return true;
  }, [busyAction, confirmDiscard, projectId]);

  const openFile = useCallback(async (path) => {
    if (!projectId || !projectAvailable || busyAction || !confirmDiscard()) return false;
    readAbortRef.current?.abort();
    const controller = new AbortController();
    readAbortRef.current = controller;
    const requestId = ++readRequestRef.current;
    const requestedProjectId = projectId;
    setActiveFile({ projectId: requestedProjectId, path });
    setContent('');
    setSavedContent('');
    setFileLoading(true);
    setFileError('');
    setStatus(null);

    try {
      const result = await workspaceFilesApi.read(requestedProjectId, path, { signal: controller.signal, token });
      if (
        controller.signal.aborted ||
        requestId !== readRequestRef.current ||
        projectIdRef.current !== requestedProjectId ||
        !projectsRef.current.some((project) => project._id === requestedProjectId)
      ) return false;
      setContent(result.content);
      setSavedContent(result.content);
      return true;
    } catch (error) {
      if (controller.signal.aborted || requestId !== readRequestRef.current || projectIdRef.current !== requestedProjectId) return false;
      setActiveFile(null);
      setContent('');
      setSavedContent('');
      setFileError(errorMessage(error));
      return false;
    } finally {
      if (requestId === readRequestRef.current && projectIdRef.current === requestedProjectId) setFileLoading(false);
    }
  }, [busyAction, confirmDiscard, projectAvailable, projectId, token]);

  const saveFile = useCallback(async () => {
    if (!activeFile || activeFile.projectId !== projectId || !projectAvailable || !isDirty || busyAction) return false;
    const requestedProjectId = projectId;
    const requestedPath = activeFile.path;
    const requestedContent = content;
    setBusyAction('Saving');
    setStatus(null);
    try {
      const result = await workspaceFilesApi.update(requestedProjectId, requestedPath, requestedContent, { token });
      if (projectIdRef.current !== requestedProjectId || !projectsRef.current.some((project) => project._id === requestedProjectId)) return false;
      setSavedContent(requestedContent);
      setActiveFile({ projectId: requestedProjectId, path: result.path });
      setStatus({ kind: 'success', message: 'File saved.' });
      await refreshFiles(requestedProjectId);
      return true;
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
      return false;
    } finally {
      setBusyAction('');
    }
  }, [activeFile, busyAction, content, isDirty, projectAvailable, projectId, refreshFiles, token]);

  const exportSource = useCallback(async () => {
    if (!projectId || !projectAvailable || busyAction) return false;
    const requestedProjectId = projectId;
    setBusyAction('Exporting');
    setStatus(null);
    try {
      const archive = await workspaceFilesApi.exportSource(requestedProjectId, { token });
      if (projectIdRef.current !== requestedProjectId || !projectsRef.current.some((project) => project._id === requestedProjectId)) return false;
      const url = window.URL.createObjectURL(archive);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'project-source.tar.gz';
      link.click();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
      setStatus({ kind: 'success', message: 'Source archive download started.' });
      return true;
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
      return false;
    } finally {
      setBusyAction('');
    }
  }, [busyAction, projectAvailable, projectId, token]);

  const createFile = useCallback(async (path) => {
    if (!projectId || !projectAvailable || !path || busyAction || !confirmDiscard()) return false;
    const requestedProjectId = projectId;
    setBusyAction('Creating');
    setStatus(null);
    try {
      const result = await workspaceFilesApi.create(requestedProjectId, path, '', { token });
      if (projectIdRef.current !== requestedProjectId || !projectsRef.current.some((project) => project._id === requestedProjectId)) return false;
      setActiveFile({ projectId: requestedProjectId, path: result.path });
      setContent(result.content);
      setSavedContent(result.content);
      setFileError('');
      setStatus({ kind: 'success', message: 'File created.' });
      await refreshFiles(requestedProjectId);
      return true;
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
      return false;
    } finally {
      setBusyAction('');
    }
  }, [busyAction, confirmDiscard, projectAvailable, projectId, refreshFiles, token]);

  const importFile = useCallback(async (path, importedContent) => {
    if (!projectId || !projectAvailable || !path || typeof importedContent !== 'string' || busyAction || !confirmDiscard()) return false;
    const requestedProjectId = projectId;
    setBusyAction('Importing');
    setStatus(null);
    try {
      const exists = fileList.projectId === requestedProjectId
        && fileList.files.some((file) => file.path === path);
      const result = exists
        ? await workspaceFilesApi.update(requestedProjectId, path, importedContent, { token })
        : await workspaceFilesApi.create(requestedProjectId, path, importedContent, { token });
      if (projectIdRef.current !== requestedProjectId || !projectsRef.current.some((project) => project._id === requestedProjectId)) return false;
      setActiveFile({ projectId: requestedProjectId, path: result.path });
      setContent(importedContent);
      setSavedContent(importedContent);
      setFileError('');
      setStatus({ kind: 'success', message: 'Repository file imported into the workspace.' });
      await refreshFiles(requestedProjectId);
      return true;
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
      return false;
    } finally {
      setBusyAction('');
    }
  }, [busyAction, confirmDiscard, fileList.files, fileList.projectId, projectAvailable, projectId, refreshFiles, token]);

  const renameFile = useCallback(async (toPath) => {
    if (!activeFile || activeFile.projectId !== projectId || !projectAvailable || !toPath || busyAction || !confirmDiscard()) return false;
    const requestedProjectId = projectId;
    const fromPath = activeFile.path;
    setBusyAction('Renaming');
    setStatus(null);
    try {
      const result = await workspaceFilesApi.rename(requestedProjectId, fromPath, toPath, { token });
      if (projectIdRef.current !== requestedProjectId || !projectsRef.current.some((project) => project._id === requestedProjectId)) return false;
      setActiveFile({ projectId: requestedProjectId, path: result.path });
      setContent(result.content);
      setSavedContent(result.content);
      setStatus({ kind: 'success', message: 'File renamed.' });
      await refreshFiles(requestedProjectId);
      return true;
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
      return false;
    } finally {
      setBusyAction('');
    }
  }, [activeFile, busyAction, confirmDiscard, projectAvailable, projectId, refreshFiles, token]);

  const deleteFile = useCallback(async () => {
    if (!activeFile || activeFile.projectId !== projectId || !projectAvailable || busyAction || !confirmDiscard()) return false;
    if (!window.confirm(`Delete ${activeFile.path}? This cannot be undone.`)) return false;
    const requestedProjectId = projectId;
    const requestedPath = activeFile.path;
    setBusyAction('Deleting');
    setStatus(null);
    try {
      await workspaceFilesApi.delete(requestedProjectId, requestedPath, { token });
      if (projectIdRef.current !== requestedProjectId || !projectsRef.current.some((project) => project._id === requestedProjectId)) return false;
      setActiveFile(null);
      setContent('');
      setSavedContent('');
      setStatus({ kind: 'success', message: 'File deleted.' });
      await refreshFiles(requestedProjectId);
      return true;
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
      return false;
    } finally {
      setBusyAction('');
    }
  }, [activeFile, busyAction, confirmDiscard, projectAvailable, projectId, refreshFiles, token]);

  return {
    projectId,
    projectAvailable,
    fileList,
    activeFile: activeFile?.projectId === projectId ? activeFile : null,
    content,
    setContent,
    fileLoading,
    fileError,
    busyAction,
    status,
    isDirty,
    confirmDiscard,
    selectProject,
    openFile,
    refreshFiles,
    saveFile,
    exportSource,
    createFile,
    importFile,
    renameFile,
    deleteFile,
  };
}
