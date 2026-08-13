export function initialPoliticalBackfillPage(cursor: string | null | undefined, complete: boolean) {
  if (complete) return 0;
  const parsed = Number(cursor ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function advancePoliticalBackfill(input: { page: number; pageRecords: number; pageSize: number; oldestDisclosure: string | null; targetFrom: string }) {
  const reachedTarget = Boolean(input.oldestDisclosure && input.oldestDisclosure <= input.targetFrom);
  const shortPage = input.pageRecords < input.pageSize;
  const complete = reachedTarget || shortPage;
  const nextPage = complete ? 0 : input.page + 1;
  return { reachedTarget, shortPage, complete, nextPage, cursor: String(nextPage) };
}
