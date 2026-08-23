"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainError = void 0;
exports.assertDomain = assertDomain;
class DomainError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'DomainError';
    }
}
exports.DomainError = DomainError;
function assertDomain(condition, code, message) {
    if (!condition)
        throw new DomainError(code, message);
}
