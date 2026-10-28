export function validateInvestigationCasesResponse(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray(value.cases) ||
    !Number.isSafeInteger(value.totalCases) ||
    value.totalCases < 0 ||
    !Number.isSafeInteger(value.openCases) ||
    value.openCases < 0 ||
    value.openCases > value.totalCases ||
    value.cases.length > value.totalCases ||
    value.cases.some((item) => !item || typeof item._id !== 'string' || typeof item.title !== 'string')
  ) {
    throw new Error('Investigation case response did not match the API contract.')
  }
  return value
}
