/** A successful retry must carry the same key as an uncertain first response. */
export function createRetryableSubmission<T extends object, R>(createKey = () => `PWA-${crypto.randomUUID()}`) {
  let attempt: { signature: string; key: string } | null = null;
  let pending: Promise<R> | null = null;
  return {
    submit(payload: T, send: (body: T & { idempotencyKey: string }) => Promise<R>): Promise<R> {
      if (pending) return pending;
      const signature = JSON.stringify(payload);
      if (!attempt || attempt.signature !== signature) attempt = { signature, key: createKey() };
      const body = { ...payload, idempotencyKey: attempt.key };
      pending = Promise.resolve().then(() => send(body)).then((result) => { attempt = null; return result; }).finally(() => { pending = null; });
      return pending;
    },
  };
}
