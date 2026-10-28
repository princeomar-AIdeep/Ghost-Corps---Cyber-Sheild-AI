'use strict';

const AutomationWorkflow = require('../../models/AutomationWorkflow');
const asyncHandler = require('../../utils/asyncHandler');

const listWorkflows = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  const [workflows, totalDrafts] = await Promise.all([
    AutomationWorkflow.find(filter).sort({ createdAt: -1 }).limit(100),
    AutomationWorkflow.countDocuments(filter),
  ]);
  res.json({ workflows, totalDrafts });
});

const createWorkflowDraft = asyncHandler(async (req, res) => {
  const workflow = await AutomationWorkflow.create({
    userId: req.user._id,
    name: req.body.name,
    description: req.body.description,
    frequency: req.body.frequency,
    status: 'draft',
    enabled: false,
  });
  res.status(201).json(workflow);
});

module.exports = { listWorkflows, createWorkflowDraft };
