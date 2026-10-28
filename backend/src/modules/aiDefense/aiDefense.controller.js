'use strict';

const getStatus = (req, res) => {
  res.json({
    available: false,
    capabilities: {
      policyEnforcement: false,
      incidentResponse: false,
      containment: false,
      auditEvents: false,
    },
    reason: 'An independently configured AI defense and response service is not available.',
  });
};

module.exports = { getStatus };
