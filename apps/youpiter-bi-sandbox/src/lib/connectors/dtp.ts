import { DTP_ENTITY_TYPE, DTP_STAGE_MAP } from "@/lib/config/dtp";
import { getBitrixWebhook } from "@/lib/server/bitrix-webhook";

export interface BitrixDtpItem {
  id: number;
  title: string;
  stageId: string;
  createdTime: string;
  updatedTime: string;
  movedTime?: string;
  opportunity: number;
  assignedById?: number;
}

const PAGE_SIZE = 50;

function toMs(value?: string) {
  if (!value) return NaN;
  return new Date(value).getTime();
}

export function isKnownDtpStage(stageId?: string) {
  return !!stageId && !!DTP_STAGE_MAP[stageId];
}

export function filterDtpItemsByCreatedRange(items: BitrixDtpItem[], from?: string, to?: string) {
  if (!from && !to) return items;

  const fromMs = from ? toMs(`${from}T00:00:00+03:00`) : Number.NEGATIVE_INFINITY;
  const toMsValue = to ? toMs(`${to}T23:59:59+03:00`) : Number.POSITIVE_INFINITY;

  return items.filter((item) => {
    const createdMs = toMs(item.createdTime);
    return Number.isFinite(createdMs) && createdMs >= fromMs && createdMs <= toMsValue;
  });
}

export async function fetchAllDtpItems(): Promise<BitrixDtpItem[]> {
  const webhook = getBitrixWebhook();
  if (!webhook) return [];

  const all: BitrixDtpItem[] = [];
  let start = 0;

  while (true) {
    const url =
      `${webhook}crm.item.list.json?entityTypeId=${DTP_ENTITY_TYPE}` +
      `&select[]=id&select[]=title&select[]=stageId` +
      `&select[]=createdTime&select[]=updatedTime&select[]=movedTime` +
      `&select[]=opportunity&select[]=assignedById` +
      `&order[createdTime]=DESC&start=${start}`;

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    const items: BitrixDtpItem[] = data?.result?.items ?? [];

    all.push(...items.filter((item) => isKnownDtpStage(item.stageId)));

    const total: number = data?.total ?? 0;
    if (items.length === 0 || start + PAGE_SIZE >= total) break;
    start += PAGE_SIZE;
  }

  return all;
}
