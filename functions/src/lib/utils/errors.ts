/** Message of a caught value, which may not be an Error. */
export function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/** An Error flagged as an image-generation quota error, so callers can stop a batch. */
export function quotaError(message: string): Error & { isQuotaError: true } {
    return Object.assign(new Error(message), { isQuotaError: true as const });
}

export function isQuotaError(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { isQuotaError?: unknown }).isQuotaError === true;
}
