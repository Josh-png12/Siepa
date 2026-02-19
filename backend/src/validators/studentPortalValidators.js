const { validateQuery } = require('./adminRequestValidators');

const studentSimulacrosQueryValidator = validateQuery({
  status: { type: 'string', enum: ['available', 'inProgress', 'completed'] },
  page: { type: 'number', min: 1 },
  limit: { type: 'number', min: 1, max: 100 }
});

const studentResultsQueryValidator = validateQuery({
  scope: { type: 'string', enum: ['all', 'virtual', 'physical'] }
});

module.exports = {
  studentSimulacrosQueryValidator,
  studentResultsQueryValidator
};
