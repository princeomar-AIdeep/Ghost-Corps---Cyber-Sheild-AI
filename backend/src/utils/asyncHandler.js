'use strict';

/**
 * asyncHandler — wraps an async route handler and forwards any rejected
 * promise to Express's next() error handler.
 *
 * Usage:
 *   router.get('/example', asyncHandler(async (req, res) => {
 *     const data = await SomeModel.find();
 *     res.json(data);
 *   }));
 *
 * Eliminates the need for repetitive try/catch blocks in every controller.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
