import type { LocalizedText, ProjectCategory } from "./contracts";
export const categories: { id: ProjectCategory; name: LocalizedText }[] = [
  { id: "software", name: { zh: "软件", en: "Software" } },
  { id: "hardware", name: { zh: "硬件", en: "Hardware" } },
  { id: "game", name: { zh: "游戏", en: "Games" } },
  { id: "aigc", name: { zh: "AIGC 影像", en: "AIGC & film" } },
  { id: "other", name: { zh: "其他", en: "Other" } },
];
