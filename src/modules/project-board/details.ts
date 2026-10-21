import type { ProjectDefinition } from "./config";
import type { ProjectDetails } from "./contracts";
/** Original editorial copy for demo concepts, not claims of working products. */
const concepts: Record<string, [string, string, string, string]> = {
  "tiny-orbits": [
    "小小的轨道实验",
    "通过改变引力与初始方向观察轨迹，学习系统中的微小变化如何影响结果；强调可撤销的尝试和直观反馈。",
    "Small orbital experiments",
    "Adjust gravity and starting direction to observe changing paths, exploring how small choices shape a system through reversible experiments.",
  ],
  "idea-atlas": [
    "从线索到问题",
    "将片段归入主题，以图谱呈现联系；创作者可以逐步标记值得验证的问题，而不是急于生成结论。",
    "From clues to questions",
    "Group fragments into themes and map their connections. Mark questions worth testing instead of rushing to conclusions.",
  ],
  "pocket-garden": [
    "把环境变成轻柔的提示",
    "设想通过环境传感与灯光反馈，让植物照护成为可观察的日常仪式，不替代专业园艺判断。",
    "A gentler environmental signal",
    "A concept connecting ambient sensing with light feedback, making plant care an observable daily ritual.",
  ],
  "echo-island": [
    "以倾听发现路径",
    "让玩家通过声源方位和回声变化探索空间；可访问性与音量控制是设计验证的重要部分。",
    "Find a path by listening",
    "Explore space through direction and changing echoes, with accessibility and volume control central to testing.",
  ],
  "quiet-clock": [
    "重新理解时间",
    "将紧迫的数字倒计时转为柔和的阶段提示，帮助使用者安排专注与休息；这是一项交互实验。",
    "Reframing time",
    "An interaction experiment replacing urgent countdowns with gentle phase cues for focus and rest.",
  ],
  "light-notes": [
    "让记录保留现场感",
    "用简单的光线与文字关联记录时刻，探索情境如何帮助回忆，同时减少多余的界面操作。",
    "Keep the context of a moment",
    "Associate light and text with moments, exploring contextual memory with fewer interface actions.",
  ],
  "shared-table": [
    "为相遇创造空间",
    "以共享桌面活动为线索连接参与者，强调明确的参与意愿与可退出机制，避免制造社交压力。",
    "Make room for connection",
    "A shared-table concept built around explicit participation and easy opt-out, without social pressure.",
  ],
  "open-sketch": [
    "让手势留下轨迹",
    "把简单输入映射成可调整的几何轨迹，尝试让不熟悉绘画的人也能探索视觉表达。",
    "Turn gestures into traces",
    "Map simple input to adjustable geometric trails, opening visual expression to people without drawing experience.",
  ],
  "paper-weather": [
    "把天气变成空间叙事",
    "以天气变化组织色彩与声音的节奏，用可解释的映射展示环境差异；不是天气预测服务。",
    "Weather as spatial storytelling",
    "Use weather changes to organize colour and sound through explainable mappings, rather than forecasting.",
  ],
  "blank-canvas": [
    "给创作一个轻的起点",
    "用少量约束提示探索方向，让空白不再意味着没有选择；保留用户对结果的控制。",
    "A lighter starting point",
    "Use a small set of prompts to open creative directions while keeping the user in control of the result.",
  ],
  "neighborhood-kit": [
    "让协作从附近开始",
    "围绕共享工具和微型活动设计信息卡片，探讨社区协作中的可理解性、信任与边界。",
    "Start collaboration nearby",
    "Explore clear information cards for shared tools and small activities, with trust and boundaries in mind.",
  ],
  "trail-lines": [
    "用脚步组织故事",
    "将路线、停留与文字组合成个人探索笔记；公开分享前需要单独确认位置隐私。",
    "Tell a story through a route",
    "Combine routes, pauses and text into exploration notes, with explicit location privacy choices before sharing.",
  ],
};
export function getProjectDetails(project: ProjectDefinition): ProjectDetails {
  const custom = concepts[project.id] ?? [
    "从想法到实验",
    "将核心想法拆成可以观察和验证的小步骤，用原型记录假设与反馈。",
    "From idea to experiment",
    "Break the idea into observable tests, using a prototype to record assumptions and feedback.",
  ];
  return {
    description: [
      {
        zh: project.name.zh + " · 项目概念\n" + project.introduction.zh,
        en: project.name.en + " · Concept\n" + project.introduction.en,
      },
      { zh: custom[0] + "\n" + custom[1], en: custom[2] + "\n" + custom[3] },
      {
        zh: "验证方向与当前阶段\n先验证核心体验、可访问性和隐私边界，再根据真实反馈迭代。本项目是原创演示概念，图像为示意，不代表已实现、已获奖或可运行产品。你可以通过评论提出问题和建议。",
        en: "Validation and current stage\nTest the core experience, accessibility and privacy boundaries before iterating with feedback. This original demo concept and its illustrations do not claim a working or awarded product. Questions and suggestions are welcome.",
      },
    ],
    media: [
      ...(project.cover
        ? [
            {
              src: project.cover,
              alt: {
                zh: project.name.zh + "概念封面",
                en: project.name.en + " concept cover",
              },
            },
          ]
        : []),
      {
        src: "/projects/interaction-map.svg",
        alt: {
          zh: project.name.zh + "体验验证流程示意",
          en: project.name.en + " experience validation diagram",
        },
      },
    ],
    links: [],
  };
}
