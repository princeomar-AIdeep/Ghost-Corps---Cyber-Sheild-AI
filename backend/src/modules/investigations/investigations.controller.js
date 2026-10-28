'use strict';

const InvestigationCase = require('../../models/InvestigationCase');
const Project = require('../../models/Project');
const asyncHandler = require('../../utils/asyncHandler');

const listCases = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  const [cases, totalCases, openCases] = await Promise.all([
    InvestigationCase.find(filter).sort({ createdAt: -1 }).limit(100),
    InvestigationCase.countDocuments(filter),
    InvestigationCase.countDocuments({ ...filter, status: 'open' }),
  ]);
  res.json({ cases, totalCases, openCases });
});

const createCase = asyncHandler(async (req, res) => {
  let projectId = null;
  if (req.body.projectId) {
    const project = await Project.findOne({
      _id: req.body.projectId,
      userId: req.user._id,
    });
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    projectId = project._id;
  }

  const investigationCase = await InvestigationCase.create({
    userId: req.user._id,
    projectId,
    title: req.body.title,
    description: req.body.description,
    severity: req.body.severity,
    status: req.body.status,
  });
  res.status(201).json(investigationCase);
});

const updateCase = asyncHandler(async (req, res) => {
  const updates = {};
  for (const field of ['title', 'description', 'severity', 'status']) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  const investigationCase = await InvestigationCase.findOneAndUpdate(
    { _id: req.params.caseId, userId: req.user._id },
    updates,
    { new: true, runValidators: true }
  );
  if (!investigationCase) return res.status(404).json({ error: 'Investigation case not found.' });
  res.json(investigationCase);
});

module.exports = { listCases, createCase, updateCase };
