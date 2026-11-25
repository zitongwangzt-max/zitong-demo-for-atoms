"use strict";

const ResumeStudio = (() => {
  const themes = Object.freeze({ paper: "纸白", ink: "深林", blue: "暮蓝" });
  const fields = Object.freeze({
    name: "姓名", role: "职位", location: "城市", email: "邮箱", phone: "电话", links: "个人链接",
    summary: "个人简介", skills: "技能", experience: "工作经历", projects: "项目", education: "教育经历",
  });
  const aliases = {
    name: ["姓名", "名字", "name"],
    role: ["职位", "岗位", "职业", "目标岗位", "求职意向", "title", "role", "position"],
    location: ["地点", "城市", "所在城市", "location", "city"],
    email: ["邮箱", "电子邮箱", "邮件", "email", "e-mail"],
    phone: ["电话", "手机号", "手机", "phone", "tel"],
    links: ["链接", "个人链接", "个人网站", "网站", "作品集", "github", "portfolio", "website", "links"],
    summary: ["介绍", "自我介绍", "简介", "个人介绍", "个人简介", "关于我", "summary", "about", "profile", "objective"],
    skills: ["技能", "专业技能", "技能栈", "技术栈", "skills", "tech stack"],
    experience: ["工作", "工作经历", "职业经历", "实习经历", "工作经验", "任职经历", "经历", "experience", "work experience", "employment"],
    projects: ["项目", "项目经历", "项目经验", "代表项目", "作品", "projects", "project"],
    education: ["教育", "教育经历", "教育背景", "学历", "education"],
    contact: ["联系方式", "联系", "contact"],
  };
  const fieldByLabel = new Map(Object.entries(aliases).flatMap(([field, labels]) => labels.map((label) => [label, field])));
  const fieldPattern = [...fieldByLabel.keys()].sort((a, b) => b.length - a.length).join("|");
  const changePrefix = new RegExp(String.raw`^(?:请(?:帮我)?\s*|帮我\s*)?(?:把\s*|将\s*)?(${fieldPattern})\s*(?:修改为|修改成|替换为|更新为|改为|改成|换成|换为|设为|设置为|写成|调整为)\s*[:：]?\s*(.+)$`, "i");
  const addPrefix = new RegExp(String.raw`^(?:请(?:帮我)?\s*|帮我\s*)?(?:再\s*)?(添加|补充|新增|加上|加|更新|修改|更改|设置)\s*(?:一个|一段|一项|一条)?\s*(${fieldPattern})(?=\s|[:：]|叫|是|为|名为|$)\s*(?:叫|是|为|名为)?\s*[:：]?\s*(.*)$`, "i");
  const visibilityPrefix = /^(?:请(?:帮我)?|帮我)?\s*(?:(?:重新显示|重新展示|恢复|取消隐藏|显示|展示)\s*|(?:隐藏|不要显示|不要展示|去掉|移除|删除)\s*)/;
  const listFields = new Set(["links", "skills", "experience", "projects", "education"]);
  const entryFields = new Set(["experience", "projects", "education"]);
  const listMarker = /^(?:[-*+•]\s+|\d+(?:\.\s+|[)）、]\s*))/;
  const hideable = new Set(["summary", "skills", "experience", "projects", "education", "location", "email", "phone", "links", "contact"]);
  const standardSections = {
    summary: "个人简介", experience: "工作经历", projects: "代表项目",
    education: "教育经历", skills: "技能", contact: "联系方式",
  };
  const standardKeys = Object.keys(standardSections);
  const namedRegions = {
    header: ["页眉", "顶部导航栏", "顶部导航", "导航栏", "导航", "页头"],
    intro: ["首屏", "姓名区域", "介绍区域", "头部", "主标题", "姓名标题", "标题"],
    footer: ["页脚", "底部栏", "底部"],
    button: ["联系我按钮", "联系按钮", "按钮"],
    monogram: ["姓名图案", "首字图案", "字母图案", "右上角图案"],
  };
  const customId = /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const layouts = new Set(["single", "sidebar-left", "sidebar-right"]);
  const fonts = {
    sans: '-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif',
    serif: 'Georgia,"Songti SC","Noto Serif CJK SC",serif',
    mono: 'ui-monospace,SFMono-Regular,Consolas,"PingFang SC","Noto Sans CJK SC",monospace',
  };
  const colorLabels = {
    surface: "卡片(?:背景|底色)(?:颜色|色)?|卡片颜色|卡片色",
    background: "页面背景(?:颜色|色)?|背景颜色|背景色|背景|底色",
    text: "正文颜色|字体颜色|文字颜色|文字色|字色|文字",
    accent: "主题颜色|强调色|点缀色|品牌色|主题色|主色调|主色|配色",
  };
  const regionColorLabels = {
    heading: "标题(?:文字)?(?:颜色|色)?",
    border: "边框(?:颜色|色)?|分割线(?:颜色|色)?|分隔线(?:颜色|色)?",
    ...colorLabels,
    background: colorLabels.background + "|区块底色|颜色",
    text: colorLabels.text + "|正文|字体",
    accent: colorLabels.accent + "|链接(?:颜色|色)?|高亮(?:颜色|色)?|标签(?:文字)?(?:颜色|色)?",
  };
  const colorRoleAliases = {
    primary: "accent", primarycolor: "accent", themecolor: "accent", accentcolor: "accent",
    bgcolor: "background", backgroundcolor: "background",
    cardbackground: "surface", cardbackgroundcolor: "surface", surfacecolor: "surface",
    color: "text", textcolor: "text", headingcolor: "heading", bordercolor: "border",
  };
  const namedColors = {
    米白色: "#faf7ed", 米白: "#faf7ed", 奶油白: "#fff8e7", 米黄色: "#f5ead2",
    白色: "#ffffff", 黑色: "#111111", 炭灰: "#252a30", 灰色: "#64748b",
    珊瑚橙: "#e76f51", 珊瑚色: "#e76f51", 橙红色: "#e55338", 橙色: "#c65c16", 橘色: "#d97416",
    酒红色: "#8b2946", 酒红: "#8b2946", 红色: "#b93443", 粉色: "#c94c79",
    薰衣草紫: "#8c6ed7", 浅紫色: "#b59bdf", 浅紫: "#b59bdf", 深紫色: "#56368a", 深紫: "#56368a", 紫色: "#7048b8",
    雾霾蓝: "#527a92", 天蓝色: "#3286b8", 浅蓝色: "#b6e0f2", 浅蓝: "#b6e0f2", 深蓝色: "#1f3c69",
    深蓝: "#1f3c69", 蓝色: "#2864b1", 青色: "#16837e",
    薄荷绿: "#6ecbac", 墨绿色: "#174f40", 墨绿: "#174f40", 绿色: "#2f7a53", 黄色: "#c6921c", 金色: "#a36d13",
    white: "#ffffff", black: "#111111", gray: "#64748b", purple: "#7048b8", orange: "#c65c16",
    red: "#b93443", green: "#2f7a53", teal: "#16837e", blue: "#2864b1", navy: "#1f3c69", pink: "#c94c79",
  };
  const rgbPattern = String.raw`rgb\(\s*(?:\d{1,3}\s*[,，]\s*\d{1,3}\s*[,，]\s*\d{1,3}|\d{1,3}\s+\d{1,3}\s+\d{1,3})\s*\)`;
  const rgbColor = new RegExp(`^${rgbPattern}$`);
  const emailPattern = /[a-z\d.!#$%&'*+/=?^_\x60{|}~-]+@[a-z\d-]+(?:\.[a-z\d-]+)+/i;
  const urlPattern = /https?:\/\/[^\s<>"'，。；、！）》】]+/gi;

  class ModelPatchError extends TypeError {
    constructor(field) {
      super(`Invalid model response field: ${field}`);
      this.field = field;
    }
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function enumName(value) {
    return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_]+/g, "-") : "";
  }

  function emptyProfile() {
    return {
      name: "", role: "", location: "", email: "", phone: "", links: [], summary: "",
      skills: [], experience: [], projects: [], education: [], customSections: [], theme: "paper", compact: false, hidden: [], design: resumeDesign(),
    };
  }

  function stripQuotes(value) {
    const clean = String(value ?? "").trim();
    const pairs = { "“": "”", "‘": "’", "「": "」", "『": "』", '"': '"', "'": "'" };
    return clean.length > 1 && pairs[clean[0]] === clean.at(-1) ? clean.slice(1, -1).trim() : clean;
  }

  function unique(values) {
    const distinct = new Map();
    for (const value of values) {
      const clean = stripQuotes(value);
      if (clean && !distinct.has(clean.toLowerCase())) distinct.set(clean.toLowerCase(), clean);
    }
    return [...distinct.values()];
  }

  function normalizeColor(value) {
    if (typeof value !== "string") return "";
    const color = stripQuotes(value).toLowerCase();
    if (/^#?[0-9a-f]{6}$/.test(color)) return "#" + color.replace(/^#/, "");
    if (/^#[0-9a-f]{3}$/.test(color)) return "#" + [...color.slice(1)].map((part) => part.repeat(2)).join("");
    if (rgbColor.test(color)) {
      const channels = color.match(/\d+/g).map(Number);
      return channels.every((channel) => channel <= 255) ? colorHex(channels) : "";
    }
    return Object.hasOwn(namedColors, color) ? namedColors[color] : "";
  }

  function customSections(profile) {
    return Array.isArray(profile?.customSections) ? profile.customSections : [];
  }

  function sectionTitle(value) {
    return typeof value === "string" ? stripQuotes(value).replace(/\s+/g, " ") : "";
  }

  function patchSections(previous, input) {
    if (!Array.isArray(input)) throw new ModelPatchError("patch.customSections");
    const ids = new Set();
    const titles = new Set(fieldByLabel.keys());
    return input.map((item) => {
      const { id, title: label, entries } = item ?? {};
      const title = sectionTitle(label);
      if (typeof id !== "string" || id.length > 64 || !customId.test(id) || ids.has(id) || !title || titles.has(title.toLowerCase())) {
        throw new ModelPatchError("patch.customSections");
      }
      if (entries !== undefined && (!Array.isArray(entries) || entries.some((entry) => typeof entry !== "string"))) {
        throw new ModelPatchError("patch.customSections.entries");
      }
      ids.add(id);
      titles.add(title.toLowerCase());
      return { id, title, entries: entries === undefined
        ? previous.find((section) => section.id === id)?.entries ?? [] : unique(entries) };
    });
  }

  function profileSectionKeys(profile) {
    return [...standardKeys, ...customSections(profile).map((section) => section.id)];
  }

  function sectionList(value, available) {
    return Array.isArray(value) ? [...new Set(value.filter((key) => available.includes(key)))] : [];
  }

  function normalizeColors(input, roles) {
    const colors = {};
    for (const key of Object.keys(roles)) {
      const color = normalizeColor(input?.[key]);
      if (color) colors[key] = color;
    }
    return colors;
  }

  function resumeDesign(profile) {
    const design = profile?.design;
    const sections = profileSectionKeys(profile);
    const regions = {};
    for (const key of [...Object.keys(namedRegions), ...sections]) {
      const colors = normalizeColors(design?.regions?.[key], regionColorLabels);
      if (Object.keys(colors).length) regions[key] = colors;
    }
    return {
      colors: normalizeColors(design?.colors, colorLabels),
      regions,
      scheme: ["light", "dark"].includes(design?.scheme) ? design.scheme : null,
      layout: layouts.has(design?.layout) ? design.layout : "single",
      sectionOrder: [...new Set([...sectionList(design?.sectionOrder, sections), ...sections])],
      sidebar: Array.isArray(design?.sidebar) ? sectionList(design.sidebar, sections) : ["skills", "contact"],
      font: typeof design?.font === "string" && Object.hasOwn(fonts, design.font) ? design.font : "sans",
      headerAlign: design?.headerAlign === "center" ? "center" : "left",
      radius: validRadius(design?.radius) ? design.radius : null,
    };
  }

  function validRadius(value) {
    return Number.isInteger(value) && value >= 0 && value <= 48;
  }

  function chooseTheme(profile, theme) {
    const design = resumeDesign(profile);
    delete design.colors.accent;
    design.scheme = null;
    return { ...profile, theme, design };
  }

  function patchTheme(profile, value) {
    if (value === null) return profile;
    const name = enumName(value);
    const preset = Object.hasOwn(themes, name) ? name : Object.keys(themes).find((key) => themes[key] === name);
    if (preset) return chooseTheme(profile, preset);
    const design = resumeDesign(profile);
    const accent = normalizeColor(value);
    if (accent) design.colors.accent = accent;
    else if (name === "light" || name === "dark") design.scheme = name;
    else throw new ModelPatchError("patch.theme");
    return { ...profile, design };
  }

  function patchColors(previous, patch, roles, field) {
    if (patch === null) return {};
    if (!isRecord(patch)) throw new ModelPatchError(field);
    const colors = { ...previous };
    for (const [key, input] of Object.entries(patch)) {
      const name = enumName(key).replaceAll("-", "");
      const role = Object.hasOwn(roles, name) ? name : Object.hasOwn(colorRoleAliases, name) ? colorRoleAliases[name] : "";
      if (!Object.hasOwn(roles, role)) throw new ModelPatchError(field);
      if (key !== role && Object.hasOwn(patch, role)) continue;
      if (input === null) {
        delete colors[role];
        continue;
      }
      const color = normalizeColor(input);
      if (!color) throw new ModelPatchError(field);
      colors[role] = color;
    }
    return colors;
  }

  function modelSectionKey(profile, value, available) {
    if (typeof value !== "string") return undefined;
    const name = stripQuotes(value).toLowerCase().replace(/^(?:section)?#/, "");
    const alias = fieldByLabel.get(name) ?? customSections(profile).find((section) => section.title.toLowerCase() === name)?.id
      ?? Object.keys(namedRegions).find((key) => namedRegions[key].includes(name));
    return available.includes(name) ? name : available.includes(alias) ? alias : undefined;
  }

  function patchDesign(profile, patch) {
    if (patch === null) return resumeDesign({ ...profile, design: null });
    if (!isRecord(patch)) throw new ModelPatchError("patch.design");
    const input = { ...patch };
    if (isRecord(patch.colors) && Object.hasOwn(patch.colors, "scheme")) {
      const { scheme, ...colors } = patch.colors;
      input.colors = colors;
      if (!Object.hasOwn(input, "scheme")) input.scheme = scheme;
    }
    const updated = resumeDesign(profile);
    const sections = profileSectionKeys(profile);
    const regions = [...sections, ...Object.keys(namedRegions)];
    for (const [field, value] of Object.entries(input)) {
      const path = `patch.design.${field}`;
      if (field === "colors") {
        updated.colors = patchColors(updated.colors, value, colorLabels, path);
      } else if (field === "regions") {
        if (value === null) {
          updated.regions = {};
          continue;
        }
        if (!isRecord(value)) throw new ModelPatchError(path);
        for (const [label, colors] of Object.entries(value)) {
          const target = modelSectionKey(profile, label, regions);
          if (!target) throw new ModelPatchError(path);
          updated.regions[target] = patchColors(updated.regions[target], colors, regionColorLabels, path);
        }
      } else if (field === "sectionOrder" || field === "sidebar") {
        if (!Array.isArray(value)) throw new ModelPatchError(path);
        const keys = value.map((label) => modelSectionKey(profile, label, sections));
        if (keys.some((key) => !key)) throw new ModelPatchError(path);
        updated[field] = field === "sectionOrder" && keys.length
          ? [...new Set([...keys, ...updated.sectionOrder])] : [...new Set(keys)];
      } else {
        updated[field] = patchDesignSetting(field, value);
      }
    }
    return resumeDesign({ ...profile, design: updated });
  }

  function patchDesignSetting(field, value) {
    const name = enumName(value);
    switch (field) {
      case "layout":
        if (layouts.has(name)) return name;
        break;
      case "scheme":
        if (value === null || name === "light" || name === "dark") return value === null ? null : name;
        break;
      case "font": {
        const font = name === "sans-serif" ? "sans" : name === "monospace" ? "mono" : name;
        if (Object.hasOwn(fonts, font)) return font;
        break;
      }
      case "headerAlign":
        if (name === "left" || name === "center") return name;
        break;
      case "radius": {
        const radius = typeof value === "string" && /^\d+(?:px)?$/i.test(value.trim()) ? parseInt(value, 10) : value;
        if (radius === null || validRadius(radius)) return radius;
        break;
      }
      default:
        if (!/^[a-z]{1,32}$/i.test(field)) throw new ModelPatchError("patch.design");
    }
    throw new ModelPatchError(`patch.design.${field}`);
  }

  function safeLink(value) {
    const raw = stripQuotes(value).replace(/[。；，)）>]+$/, "");
    if (!raw || /\s/.test(raw) || /^(?!https?:\/\/)[a-z][a-z\d+.-]*:/i.test(raw)) return "";
    try {
      const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const url = new URL(candidate);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".")) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function fieldList(field, value) {
    const lines = value.split(/\r?\n/);
    if (entryFields.has(field)) {
      const entries = [];
      let entryIndent = 0;
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const indent = raw.search(/\S/);
        if (entries.length && indent > entryIndent) {
          entries[entries.length - 1] += "\n" + line;
        } else {
          entries.push(line.replace(listMarker, ""));
          entryIndent = indent;
        }
      }
      return unique(entries);
    }
    const items = lines.map((line) => line.trimStart().replace(listMarker, ""));
    if (field === "skills") return unique(items.flatMap((line) => line.split(/[、，,；;|｜]|\s+(?:and|和|与|及)\s+|和(?=[A-Za-z])|以及/i)));
    if (field === "links") return unique(items.flatMap((line) => line.split(/[、，,；;]/)).map(safeLink));
    return unique(items);
  }

  function fieldValue(field, value) {
    const clean = stripQuotes(value);
    if (field === "email") return clean.match(emailPattern)?.[0] ?? "";
    if (field === "phone") return clean.replace(/[^\d+().\-\s]/g, "").trim();
    return clean;
  }

  function updateForm(previous, form) {
    const next = { ...previous };
    for (const field of Object.keys(fields)) {
      const value = String(form.get(field) ?? "");
      if (value === formFieldValue(field, previous[field])) continue;
      next[field] = listFields.has(field) ? fieldList(field, value) : fieldValue(field, value);
      if (next[field].length && !same(next[field], previous[field])) {
        next.hidden = next.hidden.filter((item) => item !== field);
      }
    }
    return next;
  }

  function formFieldValue(field, value) {
    if (!Array.isArray(value)) return value;
    if (entryFields.has(field)) return value.map((entry) => entry.replace(/\r?\n/g, "\n  ")).join("\n");
    return value.join("、");
  }

  function same(left, right) {
    return Array.isArray(left) ? left.length === right.length && left.every((item, index) => item === right[index]) : left === right;
  }

  function getChanges(before, after) {
    const changes = Object.keys(fields).filter((field) => !same(before[field], after[field])).map((field) => fields[field]);
    const previousDesign = resumeDesign(before);
    const nextDesign = resumeDesign(after);
    if (before.theme !== after.theme || previousDesign.scheme !== nextDesign.scheme || Object.keys(colorLabels).some((key) => previousDesign.colors[key] !== nextDesign.colors[key])) changes.push("网站主题");
    if (JSON.stringify(previousDesign.regions) !== JSON.stringify(nextDesign.regions)) changes.push("局部配色");
    if (before.compact !== after.compact || ["layout", "font", "headerAlign", "radius"].some((key) => previousDesign[key] !== nextDesign[key])) changes.push("排版");
    const sharedSections = (left, right) => left.filter((key) => right.includes(key));
    if (!same(sharedSections(previousDesign.sectionOrder, nextDesign.sectionOrder), sharedSections(nextDesign.sectionOrder, previousDesign.sectionOrder)) || !same(previousDesign.sidebar, nextDesign.sidebar)) changes.push("区块位置");
    if (JSON.stringify(customSections(before)) !== JSON.stringify(customSections(after))) changes.push("自定义栏目");
    if (!same(before.hidden, after.hidden)) changes.push("展示栏目");
    return changes;
  }

  function applyModelPatch(previous, patch) {
    if (!isRecord(patch)) throw new ModelPatchError("patch");
    let profile = { ...previous };
    if (Object.hasOwn(patch, "customSections")) {
      profile.customSections = patchSections(customSections(previous), patch.customSections);
      profile.hidden = previous.hidden.filter((key) => hideable.has(key) || profile.customSections.some((section) => section.id === key));
      profile.design = resumeDesign(profile);
    }
    if (Object.hasOwn(patch, "theme")) {
      profile = patchTheme(profile, patch.theme);
    }
    for (const [field, value] of Object.entries(patch)) {
      if (field === "theme" || field === "customSections") continue;
      if (field === "design") {
        profile.design = patchDesign(profile, value);
      } else if (field === "compact" && typeof value === "boolean") {
        profile.compact = value;
      } else if (field === "hidden" && Array.isArray(value) && value.every((key) => hideable.has(key) || customSections(profile).some((section) => section.id === key))) {
        profile.hidden = unique(value);
      } else if (listFields.has(field) && Array.isArray(value) && value.every((item) => typeof item === "string")) {
        profile[field] = entryFields.has(field)
          ? unique(value.map((entry) => entry.trimStart().replace(listMarker, "")))
          : fieldList(field, value.join("\n"));
      } else if (Object.hasOwn(fields, field) && !listFields.has(field) && typeof value === "string") {
        profile[field] = fieldValue(field, value);
      } else {
        const known = Object.hasOwn(fields, field) || field === "compact" || field === "hidden";
        throw new ModelPatchError(known ? `patch.${field}` : "patch");
      }
    }
    return { profile, changes: getChanges(previous, profile) };
  }

  function cleanLine(line) {
    return line.trim().replace(/^#{1,6}\s*/, "").replace(listMarker, "").replace(/\*\*/g, "").trim();
  }

  function labelFrom(value) {
    return fieldByLabel.get(value.toLowerCase().trim());
  }

  function isCommand(line) {
    return /^(?:请|帮我|我想(?:要|做|制作)|我要(?:做|制作)|做一个|生成|创建|调整|让|换成|改成|添加|补充|隐藏|删除|去掉|展示|显示|保存)|简历网站|个人网站|[?？]$/.test(line);
  }

  const colorPattern = String.raw`(?:#[0-9a-f]{6}(?![0-9a-f])|#[0-9a-f]{3}(?![0-9a-f])|${rgbPattern}|${Object.keys(namedColors).sort((a, b) => b.length - a.length).join("|")})`;
  const colorVerb = "设置[为成]|调整[为成]|设[为成]|调[为成]|修改[为成]|换[成为]|改[成用为]|变成|使用|选用|用|为|是";
  const pickedColor = String.raw`[”"“「『\x60]?\s*(${colorPattern})`;
  const colorOnly = new RegExp(String.raw`^(?:${colorVerb})\s*[:：]?\s*${pickedColor}`, "i");
  const firstColor = new RegExp(colorPattern, "i");
  const sectionSuffix = "(?:区块|板块|栏目|部分|区)";
  const trailingSectionSuffix = new RegExp(`${sectionSuffix}$`);
  const sectionSeparator = /\s*(?:、|以及|和|与|及)\s*/;
  const directive = String.raw`^(?:(?:然后|再|并|另外|同时|先)\s*)?(?:(?:请(?:帮我)?|帮我|我想(?:要)?)\s*)?`;
  const directivePrefix = new RegExp(directive);
  const columnPattern = "左侧栏|右侧栏|左边|左侧|左栏|右边|右侧|右栏|侧边栏|侧栏|主栏|主区";
  const columnReference = new RegExp(`^(?:靠|在)?(${columnPattern})`);
  const orderSeparator = /\s*(?:、|，|,|→|->|>)\s*/;
  const proseClause = new RegExp(String.raw`(?:${rgbPattern}|(?<=\d),(?=\d)|[^，,])+`, "gi");
  const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function colorMatchers(labels) {
    const roles = Object.values(labels).join("|");
    return {
      assign: new RegExp(String.raw`(${roles})\s*(?:${colorVerb})?\s*[:：]?\s*${pickedColor}`, "gi"),
      use: new RegExp(String.raw`(${colorPattern})\s*[”"」』\x60]?\s*(?:作为|做为|当作|做|当)\s*(${roles})`, "gi"),
      byName: Object.entries(labels).map(([role, pattern]) => [role, new RegExp(`^(?:${pattern})$`)]),
      reset: new RegExp(String.raw`^(${roles})?\s*(?:(?:改回|用回|恢复)(?:默认|主题)(?:配色|颜色|色)?|跟随主题|跟主题走|恢复默认)`),
    };
  }

  const globalColorMatchers = colorMatchers(colorLabels);
  const scopedColorMatchers = colorMatchers(regionColorLabels);

  function sectionMatchers(profile) {
    const sections = new Map(standardKeys.flatMap((key) => aliases[key].map((label) => [label, key])));
    for (const section of customSections(profile)) sections.set(section.title.toLowerCase(), section.id);
    const regions = new Map([...sections, ...Object.entries(namedRegions).flatMap(([key, labels]) => labels.map((label) => [label, key]))]);
    const matchingNames = (labels) => [...labels.keys()].sort((a, b) => b.length - a.length).map(escapePattern).join("|");
    const labeled = (labels) => String.raw`[“‘「『"']?(?:${matchingNames(labels)})[”’」』"']?\s*${sectionSuffix}?`;
    const sectionName = labeled(sections);
    const sectionGroup = String.raw`${sectionName}(?:${sectionSeparator.source}${sectionName})*`;
    const sectionNames = new RegExp(sectionName, "gi");
    function readLabel(labels, value) {
      const clean = stripQuotes(value).toLowerCase();
      return labels.get(clean) ?? labels.get(stripQuotes(clean.replace(trailingSectionSuffix, "")).toLowerCase());
    }
    return {
      key: (value) => readLabel(sections, value),
      keys: (value) => [...value.matchAll(sectionNames)].map(([label]) => readLabel(sections, label)),
      regionKey: (value) => readLabel(regions, value),
      move: new RegExp(String.raw`${directive}(?:把|将|让)?\s*(${sectionGroup})\s*(移动到|调整到|调整至|提前到|放置在|放到|放在|挪到|挪至|移到|移至|改到|排到|排在|置于|置顶|置底|提前|放|挪|排)\s*(.*)$`, "i"),
      leadingColumn: new RegExp(String.raw`${directive}(${columnPattern})\s*(?:放|展示|显示)\s*(${sectionGroup})`, "i"),
      reference: new RegExp(String.raw`^(${sectionName})\s*(之前|前面|前方|前|上面|上方|上|之后|后面|后方|后|下面|下方|下)`, "i"),
      order: new RegExp(String.raw`${directive}(?:把|将|调整)?\s*(?:区块|栏目|章节|板块|展示|内容)?顺序\s*(?:改成|调整为|设为|是|为|[:：])\s*(${sectionName}(?:${orderSeparator.source}${sectionName})*)(?=\s*(?:$|[，,。！？!?；;]))`, "i"),
      scopedColor: new RegExp(String.raw`${directive}(?:(?:只(?:要)?|单独)\s*)?(?:改一下|调整一下|改|把|将|让)?\s*(${labeled(regions)})\s*(?:中的?|的)?\s*(.+)$`, "i"),
    };
  }

  function colorRole(name, matchers) {
    return matchers.byName.find(([, pattern]) => pattern.test(name))?.[0];
  }

  function applyColorAssignments(colors, line, matchers) {
    const assignments = [
      ...[...line.matchAll(matchers.assign)].map(([, role, color]) => [role, color]),
      ...[...line.matchAll(matchers.use)].map(([, color, role]) => [role, color]),
    ];
    for (const [label, input] of assignments) {
      const role = colorRole(label, matchers);
      const color = normalizeColor(input);
      if (role && color) colors[role] = color;
    }
    return assignments.length > 0;
  }

  function applyScopedColor(design, line, matchers) {
    const scoped = line.match(matchers.scopedColor);
    if (!scoped) return false;
    const target = matchers.regionKey(scoped[1]);
    if (!target) return false;
    const heading = target === "intro" && /^(?:主标题|姓名标题|标题)$/.test(stripQuotes(scoped[1]));
    const tail = heading ? scoped[2].replace(/^(?:颜色|文字(?:颜色|色)?)/, "标题颜色") : scoped[2];
    const colors = { ...design.regions[target] };
    if (!applyColorAssignments(colors, tail, scopedColorMatchers)) {
      const reset = tail.match(scopedColorMatchers.reset);
      const color = normalizeColor(tail.match(colorOnly)?.[1]);
      if (reset) {
        const role = colorRole(reset[1], scopedColorMatchers);
        if (role) delete colors[role];
        else for (const key of Object.keys(colors)) delete colors[key];
      } else if (color) {
        colors[heading ? "heading" : "background"] = color;
      } else return false;
    }
    if (Object.keys(colors).length) design.regions[target] = colors;
    else delete design.regions[target];
    return true;
  }

  function applySectionOrder(design, line, matchers) {
    const order = line.match(matchers.order);
    if (!order) return line;
    const keys = sectionList(matchers.keys(order[1]), design.sectionOrder);
    design.sectionOrder = [...new Set([...keys, ...design.sectionOrder])];
    return line.slice(order[0].length).replace(/^[，,\s]+/, "");
  }

  function setSectionColumn(design, key, destination) {
    if (destination === "main") {
      design.sidebar = design.sidebar.filter((section) => section !== key);
      return;
    }
    if (design.layout === "single") {
      design.layout = destination === "left" ? "sidebar-left" : "sidebar-right";
      design.sidebar = [];
    }
    const useSidebar = destination === "sidebar" || design.layout === "sidebar-" + destination;
    design.sidebar = useSidebar ? [...new Set([...design.sidebar, key])] : design.sidebar.filter((section) => section !== key);
  }

  function applySectionMove(design, line, matchers) {
    const moved = line.match(matchers.move);
    const inColumn = line.match(matchers.leadingColumn);
    if (!moved && !inColumn) return false;
    const keys = sectionList(matchers.keys(moved ? moved[1] : inColumn[2]), design.sectionOrder);
    if (!keys.length) return false;
    const target = (moved ? moved[3] : inColumn[1]).replace(/^(?:到\s*在|到|在)\s*/, "").trim();
    const column = { 左: "left", 右: "right", 侧: "sidebar", 主: "main" }[target.match(columnReference)?.[1][0]];
    if (column) {
      for (const key of keys) setSectionColumn(design, key, column);
      return true;
    }

    const order = design.sectionOrder.filter((section) => !keys.includes(section));
    const anchor = target.match(matchers.reference);
    const ordinal = target.match(/^第([1-6一二三四五六])(?:个|位|项)?$/)?.[1];
    let index;
    if (/^(?:置顶|提前)$/.test(moved?.[2]) || /^(?:顶部|最上面|最上方|最前面|最前|最顶部|最上|首位|开头|最顶上)$/.test(target)) index = 0;
    else if (moved?.[2] === "置底" || /^(?:底部|最底部|最下面|最后面|最后|末尾|最下方|最后一位)$/.test(target)) index = order.length;
    else if (ordinal) index = (Number(ordinal) || "一二三四五六".indexOf(ordinal) + 1) - 1;
    else if (anchor) {
      const relative = matchers.key(anchor[1]);
      if (keys.includes(relative)) return true;
      index = order.indexOf(relative) + (/^(?:[后下]|之后)/.test(anchor[2]) ? 1 : 0);
      if (design.layout !== "single") {
        const placement = design.sidebar.includes(relative) ? "sidebar" : "main";
        for (const key of keys) setSectionColumn(design, key, placement);
      }
    } else return false;

    order.splice(index, 0, ...keys);
    design.sectionOrder = order;
    return true;
  }

  function applyStyle(profile, line, matchers) {
    const request = line.replace(directivePrefix, "");
    if (/^(?:不要|别|取消)/.test(request) && !/^(?:不要|别|取消)\s*(?:圆角|侧(?:边)?栏)$/.test(request)) return false;
    if (/^恢复默认(?:样式|外观)/.test(request)) {
      profile.design = resumeDesign({ ...profile, design: null });
      profile.theme = "paper";
      profile.compact = false;
      return true;
    }
    const design = profile.design;
    if (/^恢复默认(?:版式|排版|布局)/.test(request)) {
      const defaults = resumeDesign({ ...profile, design: null });
      Object.assign(design, defaults, { colors: design.colors, regions: design.regions, scheme: design.scheme });
      profile.compact = false;
      return true;
    }
    if (/^恢复默认(?:区块)?顺序/.test(request)) {
      design.sectionOrder = profileSectionKeys(profile);
      return true;
    }
    if (/^恢复默认配色/.test(request)) {
      design.colors = {};
      design.scheme = null;
      return true;
    }
    if (applyScopedColor(design, line, matchers) || applySectionMove(design, line, matchers)) return true;

    const colorRequest = colorOnly.test(request) || /主题|配色|风格|背景|颜色|(?:换成|换为|改成|改用|调成|切换到|想要|做成|设为).*(?:色|暮蓝|深林|纸白)|^(?:深色|浅色|暗色|纸白|深林|暮蓝|深蓝|夜色)$/i.test(line);
    const dark = /暗色|深色|夜色|夜间|黑色主题|dark/i.test(line);
    const light = /亮色|浅色|明亮|浅(?:紫|蓝|绿)|淡(?:紫|蓝|绿)|light/i.test(line);
    let handled = applyColorAssignments(design.colors, line, globalColorMatchers);
    if (handled && /主色|主题色|主题颜色/.test(line) && (dark || light)) design.scheme = dark ? "dark" : "light";
    if (!handled && colorRequest) {
      const preset = /暮蓝/.test(line) ? "blue" : /深林/.test(line) ? "ink" : /纸白|恢复默认主题/.test(line) ? "paper" : null;
      const accent = normalizeColor(line.match(firstColor)?.[0]);
      if (preset || (!accent && !design.colors.accent && (dark || light))) {
        const selected = chooseTheme(profile, preset ?? (dark ? "ink" : "paper"));
        profile.theme = selected.theme;
        Object.assign(design, selected.design);
      } else {
        if (accent) design.colors.accent = accent;
        if (dark || light) design.scheme = dark ? "dark" : "light";
      }
      handled = true;
    }

    if (/单栏|一栏|(?:取消|不要|别)\s*侧(?:边)?栏/.test(line)) {
      design.layout = "single";
      handled = true;
    } else if (/两栏|双栏|两列|双列|分栏|侧(?:边)?栏/.test(line)) {
      if (/左(?:侧|边)|靠左/.test(line)) design.layout = "sidebar-left";
      else if (design.layout === "single" || /右(?:侧|边)|靠右/.test(line)) design.layout = "sidebar-right";
      handled = true;
    }

    if (/居中|左对齐/.test(line) && /标题|头部|页眉|姓名|首屏|左对齐|^居中$/.test(line)) {
      design.headerAlign = /居中/.test(line) ? "center" : "left";
      handled = true;
    }
    if (/字体|衬线|宋体|黑体|等宽/.test(line)) {
      if (/无衬线|黑体/.test(line)) design.font = "sans";
      else if (/衬线|宋体/.test(line)) design.font = "serif";
      else if (/等宽/.test(line)) design.font = "mono";
      handled = true;
    }
    const radius = line.match(/圆角\s*(?:设为|设置为|改成|改为|调整到|改到|为|用|[:：])?\s*(\d{1,2})(?!\d)/)?.[1];
    if (/直角|(?:去掉|取消|不要|别)\s*圆角/.test(line)) {
      design.radius = 0;
      handled = true;
    } else if (radius !== undefined && validRadius(Number(radius))) {
      design.radius = Number(radius);
      handled = true;
    }
    if (/留白更多|增加留白|宽松|布局舒展|拉开间距/.test(line)) profile.compact = false;
    else if (/紧凑|减少留白|减少间距/.test(line)) profile.compact = true;
    return handled || /留白|紧凑|间距|宽松/.test(line);
  }

  function findCustomSection(profile, label) {
    const title = sectionTitle(label);
    const base = sectionTitle(title.replace(trailingSectionSuffix, ""));
    return profile.customSections.find((section) => [title, base].some((name) => name.toLowerCase() === section.title.toLowerCase()));
  }

  function addCustomSection(profile, label) {
    const title = sectionTitle(label.trim().replace(trailingSectionSuffix, ""));
    if (!title || labelFrom(title)) return null;
    const existing = findCustomSection(profile, title);
    if (existing) return existing;
    const ids = new Set(profileSectionKeys(profile));
    let sequence = 1;
    while (ids.has("custom-" + sequence)) sequence++;
    const section = { id: "custom-" + sequence, title, entries: [] };
    profile.customSections.push(section);
    return section;
  }

  const commonSection = /^(?:荣誉(?:与)?(?:获奖|奖项)|荣誉|获奖(?:经历|情况)?|奖项|证书|资格证书|志愿服务|开源贡献|兴趣爱好|语言能力|发表论文|论文)$/;
  const createCustom = new RegExp(String.raw`${directive}(?:新增|增加|创建|添加|加上)\s*(一个新的?|一个|一栏)?\s*(自定义(?:栏目|区块)|栏目|区块)?\s*(?:名为|叫做?|标题为)?\s*([^：:，,。！!；;]+?)(?:\s*[:：]\s*(.*))?$`);
  const renameCustom = new RegExp(String.raw`${directive}(?:把|将)?\s*(.+?)\s*(?:改名为|改名叫|重命名为|更名为)\s*[:：]?\s*(.+)$`);
  const addCustom = new RegExp(String.raw`${directive}(?:给|在|向)?\s*(.+?)\s*(?:栏目|区块)?(?:里面|中|里)?\s*(?:补充|添加|追加|加上|加)(?:一条|一项)?\s*[:：]?\s*(.+)$`);
  const replaceCustom = new RegExp(String.raw`${directive}(?:把|将)?\s*(.+?)\s*(?:的)?内容\s*(?:修改为|改为|改成|换成|替换为)\s*[:：]?\s*(.*)$`);

  function applyCustomCommand(profile, line) {
    const creation = line.match(createCustom);
    if (creation) {
      const [, indicator, shape, label, entry] = creation;
      const title = sectionTitle(label);
      if (indicator || shape || trailingSectionSuffix.test(title) || commonSection.test(title)) {
        const section = addCustomSection(profile, label);
        if (section) return { section, entry };
      }
    }
    const rename = line.match(renameCustom);
    if (rename) {
      const section = findCustomSection(profile, rename[1]);
      const title = sectionTitle(rename[2].replace(/[。！!]$/, ""));
      if (section && title && !labelFrom(title) && !findCustomSection(profile, title)) {
        section.title = title;
        return { section };
      }
    }
    const update = line.match(addCustom) ?? line.match(replaceCustom);
    if (update) {
      const section = findCustomSection(profile, update[1]);
      if (section) return { section, entry: update[2], replace: replaceCustom.test(line) };
    }
    return null;
  }

  function applyPrompt(previous, input, first = false) {
    const profile = { ...previous, hidden: [...previous.hidden], design: resumeDesign(previous),
      customSections: customSections(previous).map((section) => ({ ...section })) };
    const freeText = [];
    const labeled = new Set();
    let section = "";
    let matchers = sectionMatchers(profile);

    function record(field, value, replace = false) {
      const custom = profile.customSections.find((item) => item.id === field);
      if (custom) {
        const entries = fieldList("experience", value);
        custom.entries = replace ? entries : unique([...custom.entries, ...entries]);
        return;
      }
      if (!value.trim()) return;
      if (field === "contact") {
        const email = value.match(emailPattern)?.[0];
        const phone = value.match(/\+?\d[\d\s().-]{5,}\d/)?.[0];
        const links = value.match(urlPattern);
        if (email) record("email", email);
        if (phone) record("phone", phone);
        if (links) record("links", links.join("\n"), replace);
        return;
      }
      const clean = listFields.has(field) ? fieldList(field, value) : fieldValue(field, value);
      if (!clean.length) return;
      profile[field] = listFields.has(field) && !replace ? unique([...profile[field], ...clean]) : clean;
      labeled.add(field);
    }

    const nextField = String.raw`(?:把|将)?\s*(?:${fieldPattern})\s*(?:[:：]|改成|改为|换成|更新为|修改成|修改为)`;
    const inlineHeaders = new RegExp(String.raw`[，,；;]\s*(?:(?:然后|另外|并)\s*)?(?=${nextField})|[；;]\s*(?=(?:然后|另外|并|请|把|将|让|只把|单独|主色|主题|背景|新增|添加))`, "gi");
    for (const source of input.split(/\r?\n/).flatMap((line) => line.split(inlineHeaders))) {
      const line = cleanLine(source);
      if (!line) {
        section = "";
        continue;
      }
      const change = line.match(changePrefix);
      const addition = line.match(addPrefix);
      const visibility = line.match(visibilityPrefix);
      const visibleName = visibility && line.slice(visibility[0].length).replace(/[。！!]$/, "");
      const visibleCustom = visibleName && findCustomSection(profile, visibleName);
      const visibleField = visibleName && (visibleCustom?.id ?? labelFrom(visibleName.replace(/(?:栏目|区块|部分|模块|信息)$/, "")));
      if (change) {
        const field = labelFrom(change[1]);
        const color = normalizeColor(change[2].replace(/[。！!]$/, ""));
        if (color && standardKeys.includes(field)) freeText.push(line);
        else record(field, change[2], true);
        section = "";
        continue;
      }
      if (addition && addition[3]) {
        const append = /添加|补充|新增|加/.test(addition[1]);
        record(labelFrom(addition[2]), addition[3], !append);
        section = "";
        continue;
      }
      if (visibleField && (visibleCustom || hideable.has(visibleField))) {
        if (visibleCustom && /删除|移除/.test(visibility[0])) {
          profile.customSections = profile.customSections.filter((item) => item.id !== visibleField);
          profile.hidden = profile.hidden.filter((field) => field !== visibleField);
          matchers = sectionMatchers(profile);
        } else if (/删除/.test(visibility[0])) {
          const empty = emptyProfile();
          const removals = visibleField === "contact" ? ["email", "phone", "links"] : [visibleField];
          for (const field of removals) profile[field] = empty[field];
        } else if (/重新显示|重新展示|恢复|取消隐藏|显示|展示/.test(visibility[0]) && !/不要/.test(visibility[0])) {
          profile.hidden = profile.hidden.filter((field) => field !== visibleField);
        } else if (!profile.hidden.includes(visibleField)) profile.hidden.push(visibleField);
        section = "";
        continue;
      }

      const customEdit = applyCustomCommand(profile, line.replace(/[。！!]$/, ""));
      if (customEdit) {
        if (customEdit.entry !== undefined) record(customEdit.section.id, customEdit.entry, customEdit.replace);
        matchers = sectionMatchers(profile);
        section = customEdit.section.id;
        continue;
      }

      const header = line.match(/^([^：:]+)[：:]\s*(.*)$/);
      const label = header?.[1] ?? line;
      const custom = (header || first) && (findCustomSection(profile, label) ||
        (commonSection.test(sectionTitle(label)) && addCustomSection(profile, label)));
      if (custom) {
        record(custom.id, header?.[2] ?? "");
        matchers = sectionMatchers(profile);
        section = custom.id;
        continue;
      }
      const field = labelFrom(label);
      if (field) {
        const value = header?.[2] ?? "";
        record(field, value);
        section = !value || listFields.has(field) ? field : "";
        continue;
      }
      const colorTail = section && line.match(matchers.scopedColor)?.[2];
      const colorEdit = colorTail && (colorOnly.test(colorTail) || scopedColorMatchers.reset.test(colorTail) || colorTail.match(scopedColorMatchers.assign) || colorTail.match(scopedColorMatchers.use));
      if (section && !colorEdit && !matchers.move.test(line) && !matchers.leadingColumn.test(line) && !matchers.order.test(line) && !/^(?:请|帮我|我想|把|将|只把|新增|换成|改成|设置|主题|风格|切换到|背景|主色|配色|文字颜色|卡片色|双栏|两栏|标题居中|字体|圆角|恢复默认)/.test(line)) {
        if (section === "summary" && labeled.has("summary")) record("summary", `${profile.summary}\n${line}`);
        else record(section, line);
        if (!listFields.has(section) && section !== "summary" && !customId.test(section)) section = "";
        continue;
      }
      section = "";
      freeText.push(line);
    }

    profile.design = resumeDesign(profile);
    const remaining = [];
    for (const part of freeText.flatMap((line) => line.split(/[。！？!?；;]/))) {
      const line = applySectionOrder(profile.design, part.trim(), matchers);
      if (!line) continue;
      const englishIntro = line.match(/^(?:[Mm]y name is|[Ii] am|[Ii]'m)\s+([A-Z][a-z]+(?:[ -][A-Z][a-z]+){1,3})\b/);
      if (englishIntro && !labeled.has("name")) record("name", englishIntro[1]);
      for (const value of line.match(proseClause) ?? []) {
        const clause = value.trim();
        if (!clause) continue;
        const mail = clause.match(emailPattern)?.[0];
        const urls = clause.match(urlPattern);
        if (mail && !labeled.has("email")) record("email", mail);
        if (urls) record("links", urls.join("\n"));
        let spokenName = clause.match(/^(?:(?:您好|你好)[，,\s]*)?(?:我叫|我的名字是|本人叫|姓名为)\s*(.+?)(?=\s*(?:是一名|是个|目前|职业是)|$)/)?.[1]?.trim();
        if (!spokenName && /^我是[\p{Script=Han}]{2,3}$/u.test(clause) && !/(?:学生|前端|后端|设计|测试|运营|教师|医生|工程|产品|经理|实习|博士|硕士|应届|助理|顾问)$/.test(clause)) {
          spokenName = clause.slice(2);
        }
        if (spokenName && /^[\p{L}\p{M}\s·.'’-]{2,40}$/u.test(spokenName)) {
          if (!labeled.has("name")) record("name", spokenName);
          if (!/(?:是一名|是个|职业是)/.test(clause)) continue;
        }
        const spokenRole = clause.match(/^(?:我叫.{2,20}?(?=是一名|是个|职业是))?(?:我)?(?:目前是|现在是|从事的是|求职意向是|目标岗位是|职业是|是)(?:一名|一个|一位|个)?\s*(.+)$/)?.[1]
          ?? clause.match(/^(?:I am|I'm)\s+(?:an?\s+)?(.+)$/i)?.[1]
          ?? clause.match(/^(.{2,28}(?:工程师|设计师|开发者|产品经理|应届毕业生|研究员|分析师|教师|运营|编辑))$/)?.[1];
        if (spokenRole && (!englishIntro || spokenRole !== englishIntro[1])) {
          if (!labeled.has("role")) record("role", spokenRole);
          continue;
        }
        const skills = clause.match(/^(?:我)?(?:擅长|精通|熟悉|掌握|会用|主要使用|技术栈包括|技能包括|技能有)(?:使用)?\s*[:：]?\s*(.+)$/)?.[1];
        if (skills) {
          record("skills", skills);
          continue;
        }
        const project = clause.match(/^(?:我)?(?:做过|参与过|主导过|开发过|独立完成|项目包括|最近做了|完成了)(?:一个|一项)?\s*(.+)$/)?.[1];
        if (project) {
          record("projects", project);
          continue;
        }
        if (/^(?:我)?(?:曾在|目前在|就职于|任职于|在.+?(?=担任))/.test(clause)) {
          record("experience", clause.replace(/^我/, ""));
          continue;
        }
        const education = clause.match(/^(?:我)?(?:本科毕业于|硕士毕业于|本科就读于|毕业于|就读于|在读于)\s*(.+)$/)?.[1];
        if (education) {
          record("education", education);
          continue;
        }
        const location = clause.match(/^(?:我)?(?:现居|常驻|来自|坐标|base(?:d in)?)\s*[:：]?\s*(.{1,35})$/i)?.[1];
        if (location) {
          record("location", location);
          continue;
        }
        const phone = clause.match(/^(?:我的)?(?:电话|手机|手机号)(?:号)?(?:是|为|\s*[:：])\s*(\+?\d[\d\s().-]{5,}\d)$/)?.[1];
        if (phone) {
          record("phone", phone);
          continue;
        }
        if (applyStyle(profile, clause, matchers) || mail || urls || isCommand(clause) || englishIntro?.[0] === clause) continue;
        if (clause.length >= 6) remaining.push(clause);
      }
    }
    if (first && !profile.summary && remaining.length) record("summary", `${remaining.join("，")}。`);
    return { profile, changes: getChanges(previous, profile) };
  }

  const examples = Object.freeze({
    designer: `我叫林雨桐，是一名产品设计师。
城市：杭州
个人简介：我擅长把复杂的流程整理成易懂的界面，习惯从访谈和原型验证开始。
工作经历：
- 云径科技 · 产品设计师 | 2022–至今：负责移动端购票体验和组件库维护。
项目：
- 城市出行 App 改版：梳理购票和退改签流程，统一关键页面的交互。
- 设计系统：整理基础组件、交互规范和设计交付文档。
技能：Figma、用户研究、交互设计、设计系统
教育经历：数字媒体艺术 · 学士
邮箱：yutong@example.com`,
    engineer: `我叫陈子安，是一名前端工程师。
城市：上海
个人简介：我喜欢做响应快、容易使用的网页，也会写工具来减少团队的重复工作。
工作经历：
- 微原工作室 · 前端工程师 | 2021–至今：参与后台产品和共享组件库的开发。
项目：
- 数据看板：用 React 和 TypeScript 实现数据筛选、图表联动和权限视图。
- 组件文档站：为常用组件补充交互示例、键盘操作说明和使用文档。
技能：React、TypeScript、CSS、Node.js
邮箱：zian@example.com`,
    graduate: `姓名：许知夏
职位：数据分析助理
城市：南京
个人简介：统计学应届毕业生，喜欢把数据清洗、可视化和业务问题放在一起做。
教育经历：统计学 · 本科 | 2022–2026
项目：
- 校园食堂调研：设计问卷，清洗和分组比较反馈，整理出高峰排队问题。
- 公共出行数据分析：用 Python 清理数据，用图表展示时段和区域变化。
技能：Python、SQL、Excel、数据可视化
邮箱：zhixia@example.com`,
  });

  const palettes = {
    paper: { bg: "#f8f8f0", panel: "#eef2e6", text: "#1e2720", faint: "#46534a", accent: "#285b42", line: "#d1dccf", art: "#ddebd9", ring: "#89b390" },
    ink: { bg: "#14211c", panel: "#20332a", text: "#edf4e9", faint: "#c0d0c3", accent: "#b6e9bd", line: "#3a5244", art: "#264336", ring: "#629a74" },
    blue: { bg: "#152239", panel: "#1e304a", text: "#eff4fc", faint: "#c4d1e6", accent: "#b2d0ff", line: "#405675", art: "#28426a", ring: "#7497d2" },
  };
  const lightText = "#ffffff";
  const darkText = "#111611";

  function colorChannels(color) {
    return [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
  }

  function colorHex(channels) {
    return "#" + channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("");
  }

  function mixColors(background, foreground, amount) {
    const other = colorChannels(foreground);
    return colorHex(colorChannels(background).map((channel, index) => channel + (other[index] - channel) * amount));
  }

  function luminance(color) {
    const [red, green, blue] = colorChannels(color).map((value) => {
      const fraction = value / 255;
      return fraction <= 0.04045 ? fraction / 12.92 : ((fraction + 0.055) / 1.055) ** 2.4;
    });
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  }

  function contrast(left, right) {
    const a = luminance(left) + 0.05;
    const b = luminance(right) + 0.05;
    return Math.max(a, b) / Math.min(a, b);
  }

  function contrastingText(background) {
    const light = contrast(background, lightText);
    const dark = contrast(background, darkText);
    if (dark >= 4.5 && dark >= light) return darkText;
    return light >= 4.5 ? lightText : "#000000";
  }

  function readableColor(color, background) {
    return contrast(color, background) >= 4.5 ? color : contrastingText(background);
  }

  function readableAccent(color, background) {
    const ink = contrastingText(background);
    for (const amount of [0, .2, .35, .5, .65, .8]) {
      const tint = mixColors(color, ink, amount);
      if (contrast(tint, background) >= 4.5) return tint;
    }
    return ink;
  }

  function tintedPalette(accent, dark) {
    const bg = mixColors(dark ? "#121218" : "#fdfcfb", accent, dark ? .1 : .075);
    const panel = mixColors(dark ? "#1e1d24" : "#ffffff", accent, dark ? .14 : .12);
    const text = mixColors(dark ? "#f8f7fa" : "#18171b", accent, dark ? .13 : .26);
    return {
      bg, panel, text, accent,
      faint: mixColors(bg, text, .73),
      line: mixColors(bg, accent, dark ? .35 : .25),
      art: mixColors(bg, accent, dark ? .28 : .2),
      ring: mixColors(bg, accent, .55),
    };
  }

  function resolvePalette(theme, { colors, scheme }) {
    const base = Object.hasOwn(palettes, theme) ? palettes[theme] : palettes.paper;
    const accent = colors.accent ?? base.accent;
    const dark = scheme ? scheme === "dark" : contrastingText(base.bg) === lightText;
    const themeColors = colors.accent || scheme ? tintedPalette(accent, dark) : base;
    const bg = colors.background ?? themeColors.bg;
    const text = colors.text ?? readableColor(themeColors.text, bg);
    const panel = colors.surface ?? themeColors.panel;
    const faint = colors.background || colors.text ? readableColor(mixColors(bg, text, .79), bg) : themeColors.faint;
    return {
      ...themeColors, bg, text, panel, faint,
      line: colors.background ? mixColors(bg, text, .22) : themeColors.line,
      "accent-ink": readableAccent(accent, bg),
      "accent-fg": readableColor(bg, accent),
      "art-ink": readableAccent(accent, themeColors.art),
      "panel-text": readableColor(text, panel),
      "panel-faint": readableColor(faint, panel),
      "panel-accent": readableAccent(accent, panel),
    };
  }

  function themeDisplay(profile) {
    const theme = Object.hasOwn(themes, profile?.theme) ? profile.theme : "paper";
    const design = resumeDesign(profile);
    const { colors } = design;
    const palette = resolvePalette(theme, design);
    return {
      value: Object.keys(colors).length || design.scheme ? "custom" : theme,
      color: colors.accent ?? colors.background ?? colors.surface ?? colors.text ?? (design.scheme ? palette.accent : ""),
      dark: design.scheme ? design.scheme === "dark" : theme !== "paper",
    };
  }

  function areaVariables(region, palette, defaultBackground) {
    if (!region) return {};
    const bg = region.background ?? defaultBackground;
    const text = region.text ?? readableColor(palette.text, bg);
    const accent = region.accent ?? palette.accent;
    const colors = {};
    if (region.background) {
      colors.bg = bg;
      colors.border = mixColors(bg, text, .22);
    }
    if (region.background || region.text) {
      colors.text = text;
      colors.muted = readableColor(mixColors(bg, text, .79), bg);
    }
    if (region.accent || region.background) colors.accent = readableAccent(accent, bg);
    if (region.accent) {
      colors.fill = accent;
      colors["fill-text"] = contrastingText(accent);
    }
    if (region.heading || region.accent) colors.heading = region.heading ?? colors.accent;
    if (region.border) colors.border = region.border;
    if (region.surface || region.text || region.accent) {
      const card = region.surface ?? palette.panel;
      if (region.surface) colors.card = card;
      colors["card-text"] = readableColor(text, card);
      colors["card-muted"] = readableColor(mixColors(card, text, .79), card);
      colors["card-accent"] = readableAccent(accent, card);
    }
    return colors;
  }

  function areaAttributes(region, palette, { bg = palette.bg, style = "" } = {}) {
    const colors = areaVariables(region, palette, bg);
    const declarations = style + Object.entries(colors).map(([name, value]) => `--area-${name}:${value};`).join("");
    return (region?.background ? ' data-tinted' : "") + (declarations ? ` style="${declarations}"` : "");
  }

  const escapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const html = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => escapes[character]);

  function entryBody(lines) {
    const blocks = [];
    for (const text of lines) {
      const line = text.trim();
      if (!line) continue;
      const bullet = listMarker.test(line);
      if (blocks.at(-1)?.bullet !== bullet) blocks.push({ bullet, lines: [] });
      blocks.at(-1).lines.push(line.replace(listMarker, ""));
    }
    return blocks.map(({ bullet, lines }) => bullet
      ? `<ul>${lines.map((line) => `<li>${html(line)}</li>`).join("")}</ul>`
      : `<p>${html(lines.join("\n"))}</p>`).join("");
  }

  function card(value) {
    const [first, ...lines] = value.split(/\r?\n/);
    const detail = first.match(/^(.{1,110}?)[：:]\s*(.*)$/);
    const headline = (detail?.[1] ?? first).split(/\s*[|｜]\s*/);
    return `<article class="entry"><h3>${html(headline[0])}</h3>${headline.length > 1 ? `<p class="meta">${html(headline.slice(1).join(" · "))}</p>` : ""}${entryBody([detail?.[2] ?? "", ...lines])}</article>`;
  }

  function buildHTML(data, { preview = false } = {}) {
    const design = resumeDesign(data);
    const palette = resolvePalette(data.theme, design);
    const labels = { ...standardSections };
    const area = (key, options) => areaAttributes(design.regions[key], palette, options);
    const visible = (field) => !data.hidden.includes(field);
    const fragment = (id) => (preview ? "about:srcdoc" : "") + "#" + id;
    const name = data.name || "个人简历";
    const role = data.role;
    const summary = visible("summary") ? data.summary : "";
    const place = visible("location") ? data.location : "";
    const identifier = Array.from(name.trim())[0] || "F";
    const skills = visible("skills") ? data.skills : [];
    const contact = visible("contact") && [
      visible("email") && data.email && `<a href="mailto:${html(data.email)}">${html(data.email)}</a>`,
      visible("phone") && data.phone && `<a href="tel:${html(data.phone.replace(/[^\d+]/g, ""))}">${html(data.phone)}</a>`,
      ...(visible("links") ? data.links.map(safeLink).filter(Boolean).map((link) =>
        `<a href="${html(link)}" target="_blank" rel="noopener noreferrer">${html(new URL(link).hostname.replace(/^www\./, ""))}</a>`) : []),
    ].filter(Boolean);
    const content = {
      summary: summary ? `<p class="section-summary">${html(summary)}</p>` : "",
      skills: skills.length ? `<div class="chips">${skills.map((skill) => `<span>${html(skill)}</span>`).join("")}</div>` : "",
      contact: contact?.length ? `<div class="links">${contact.join("")}</div>` : "",
    };
    for (const key of ["experience", "projects", "education"]) {
      if (visible(key) && data[key].length) content[key] = `<div class="entries">${data[key].map(card).join("")}</div>`;
    }
    for (const section of customSections(data)) {
      if (!visible(section.id)) continue;
      labels[section.id] = section.title;
      content[section.id] = section.entries.length
        ? `<div class="entries">${section.entries.map(card).join("")}</div>` : " ";
    }
    const visibleSections = design.sectionOrder.filter((key) => content[key]);
    const summaryInIntro = visibleSections[0] === "summary" && (design.layout === "single" || !design.sidebar.includes("summary"));
    const sections = summaryInIntro ? visibleSections.slice(1) : visibleSections;
    const sideSections = design.layout === "single" ? [] : sections.filter((key) => design.sidebar.includes(key));
    const renderSections = (keys, bg) => keys.map((key) =>
      `<section class="section" id="${key}"${area(key, { bg, style: `--section-order:${design.sectionOrder.indexOf(key)};` })}><h2>${html(labels[key])}</h2>${content[key]}</section>`,
    ).join("\n    ");
    let bodySections;
    if (sideSections.length) {
      const primary = `<div class="resume-primary">${renderSections(sections.filter((key) => !sideSections.includes(key)))}</div>`;
      const sidebar = `<aside class="resume-sidebar" aria-label="侧栏">${renderSections(sideSections, palette.panel)}</aside>`;
      const columns = design.layout === "sidebar-left" ? sidebar + primary : primary + sidebar;
      bodySections = `<div class="resume-columns" data-layout="${design.layout}">${columns}</div>`;
    } else {
      bodySections = renderSections(sections);
    }
    const title = `${name}${role ? ` · ${role}` : ""}`;

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'">
  <meta name="description" content="${html((summary || title).slice(0, 180))}">
  <title>${html(title)}</title>
  <style>
    :root {
      ${Object.entries(palette).map(([key, value]) => `--${key}:${value};`).join("\n      ")}
      --pace:${data.compact ? ".72" : "1"};
      --font:${fonts[design.font]};
      ${design.radius === null ? "" : `--corner:${design.radius}px;`}
      color-scheme:${contrastingText(palette.bg) === lightText ? "dark" : "light"};
    }
    *, *::before, *::after { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; background:var(--bg); color:var(--text); font-family:var(--font); line-height:1.6; }
    a { color:inherit; text-decoration:none; }
    a:focus-visible { outline:2px solid var(--accent-ink); outline-offset:4px; }
    h1,h2,h3,p { margin:0; }
    .wrap { width:min(100% - 72px,1040px); margin-inline:auto; }
    .top { background:var(--area-bg,transparent); color:var(--area-text,inherit); border-bottom:1px solid var(--area-border,var(--line)); }
    .top .wrap { min-height:65px; display:flex; align-items:center; justify-content:space-between; padding-block:10px; flex-wrap:wrap; gap:8px 22px; }
    .nameplate { display:inline-flex; align-items:center; gap:9px; color:var(--area-heading,inherit); font-weight:730; overflow-wrap:anywhere; }
    .nameplate b { display:grid; place-items:center; flex:none; width:29px; height:29px; border-radius:var(--corner,7px); background:var(--area-fill,var(--accent)); color:var(--area-fill-text,var(--accent-fg)); font-size:.85rem; }
    nav { display:flex; gap:6px 18px; flex-wrap:wrap; color:var(--area-text,var(--faint)); font-size:.8125rem; }
    nav a:hover, .links a:hover { color:var(--area-accent,var(--accent-ink)); text-decoration:underline; }
    main { padding-block:calc(49px * var(--pace)) calc(46px * var(--pace)); }
    .intro { display:grid; grid-template-columns:minmax(0,1fr) minmax(132px,34%); align-items:center; gap:24px; padding-block:calc(15px * var(--pace)) calc(44px * var(--pace)); background:var(--area-bg,transparent); }
    .intro.is-centered { grid-template-columns:minmax(0,1fr); justify-items:center; text-align:center; }
    .intro.is-centered .summary { margin-inline:auto; }
    .intro.is-centered .monogram { grid-row:1; width:clamp(84px,18%,138px); min-height:0; aspect-ratio:1; font-size:clamp(2rem,6vw,3.9rem); }
    .role { margin-bottom:7px; color:var(--area-accent,var(--accent-ink)); font-size:.875rem; font-weight:700; letter-spacing:.06em; overflow-wrap:anywhere; }
    h1 { color:var(--area-heading,var(--area-text,var(--text))); font-size:clamp(2.5rem,7.6vw,5rem); font-weight:760; letter-spacing:-.065em; line-height:1.15; overflow-wrap:anywhere; }
    .location { margin-top:9px; color:var(--area-muted,var(--faint)); font-size:.875rem; }
    .summary { --area-bg:initial; max-width:36rem; margin-top:14px; background:var(--area-bg,transparent); color:var(--area-text,var(--area-muted,var(--faint))); overflow-wrap:anywhere; white-space:pre-wrap; }
    .summary[data-tinted] { padding:.5em .7em; border-radius:var(--corner,8px); }
    .contact-link,.monogram { --area-bg:initial; --area-text:initial; --area-border:initial; --area-accent:initial; --area-fill:initial; --area-fill-text:initial; }
    .contact-link { display:inline-flex; align-items:center; min-height:36px; margin-top:17px; padding:4px 13px; background:var(--area-bg,var(--area-fill,var(--accent))); color:var(--area-text,var(--area-fill-text,var(--accent-fg))); border:1px solid var(--area-border,var(--area-fill,var(--accent))); border-radius:var(--corner,8px); font-size:.8125rem; font-weight:660; }
    .contact-link:hover { filter:brightness(.91); }
    .monogram { display:grid; place-items:center; min-height:160px; aspect-ratio:1.2; position:relative; isolation:isolate; overflow:hidden; background:var(--area-bg,var(--art)); color:var(--area-text,var(--area-accent,var(--art-ink))); border:1px solid var(--area-border,var(--line)); border-radius:var(--corner,15px); font-family:"Songti SC",Georgia,serif; font-size:clamp(2.5rem,8.7vw,5.5rem); line-height:1; }
    .monogram::after { position:absolute; inset:0; z-index:-1; background:repeating-radial-gradient(ellipse at 50% 50%, transparent 0 12px, var(--area-border,var(--ring)) 13px 13.7px, transparent 14.2px 21px); opacity:.46; content:""; mask-image:radial-gradient(ellipse at center,transparent 10%, #000 50%); }
    .monogram span { display:grid; place-items:center; width:1.54em; height:1.54em; border:1px solid var(--area-border,var(--ring)); border-radius:50%; background:var(--area-bg,var(--art)); }
    .intro[data-tinted], .section[data-tinted] { padding-inline:14px; border-radius:var(--corner,10px); }
    .section { padding-block:calc(22px * var(--pace)); border-top:1px solid var(--area-border,var(--line)); background:var(--area-bg,transparent); color:var(--area-text,inherit); scroll-margin-top:14px; }
    .section h2 { margin-bottom:12px; color:var(--area-heading,inherit); font-size:1.22rem; line-height:1.35; letter-spacing:-.035em; overflow-wrap:anywhere; }
    .section-summary { color:var(--area-muted,var(--section-faint,var(--faint))); overflow-wrap:anywhere; white-space:pre-wrap; }
    .resume-columns { display:grid; grid-template-columns:minmax(0,1.7fr) minmax(0,.83fr); align-items:start; gap:clamp(17px,4vw,42px); }
    .resume-columns[data-layout="sidebar-left"] { grid-template-columns:minmax(0,.83fr) minmax(0,1.7fr); }
    .resume-primary,.resume-sidebar { min-width:0; }
    .resume-sidebar { --section-accent:var(--panel-accent); --section-faint:var(--panel-faint); padding-inline:14px; border:1px solid var(--line); border-radius:var(--corner,12px); background:var(--panel); color:var(--panel-text); }
    .resume-sidebar .section:first-child { border-top:0; }
    .entries { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
    #experience .entries, #education .entries, .resume-sidebar .entries { grid-template-columns:1fr; }
    .entry { padding:13px 15px; border:1px solid var(--area-border,var(--line)); background:var(--area-card,var(--panel)); color:var(--area-card-text,var(--panel-text)); border-radius:var(--corner,10px); overflow-wrap:anywhere; }
    .entry h3 { font-size:.97rem; font-weight:730; }
    .entry p, .entry ul { margin-top:5px; color:var(--area-card-muted,var(--panel-faint)); font-size:.875rem; white-space:pre-wrap; }
    .entry ul { margin-bottom:0; padding-inline-start:1.2em; }
    .entry li + li { margin-top:3px; }
    .entry .meta { color:var(--area-card-accent,var(--panel-accent)); font-size:.8rem; }
    .chips,.links { display:flex; flex-wrap:wrap; gap:7px; }
    .chips span,.links a { padding:4px 9px; border:1px solid var(--area-border,var(--line)); border-radius:var(--corner,100px); color:var(--area-accent,var(--section-accent,var(--accent-ink))); font-size:.81rem; overflow-wrap:anywhere; max-width:100%; }
    .links a:hover { color:var(--area-accent,var(--section-accent,var(--accent-ink))); }
    footer { padding-block:15px; background:var(--area-bg,transparent); border-top:1px solid var(--area-border,var(--line)); color:var(--area-text,var(--faint)); font-size:.8125rem; }
    @media (max-width:525px) {
      .wrap { width:calc(100% - 34px); }
      .top .wrap { min-height:53px; gap:5px 13px; }
      nav { gap:4px 9px; }
      main { padding-top:calc(22px * var(--pace)); }
      .intro { gap:13px; grid-template-columns:minmax(0,1fr) 80px; align-items:start; }
      .monogram { min-height:0; aspect-ratio:1; font-size:2rem; border-radius:var(--corner,10px); margin-top:6px; }
      .entries { grid-template-columns:1fr; }
      .resume-columns { display:flex; flex-direction:column; gap:0; align-items:stretch; }
      .resume-columns > * { display:contents; }
      .resume-sidebar { --section-accent:var(--accent-ink); --section-faint:var(--faint); color:inherit; }
      .resume-columns .section { order:var(--section-order); }
      .resume-sidebar .section:first-child { border-top:1px solid var(--area-border,var(--line)); }
    }
    @media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } }
  </style>
</head>
<body>
  <header class="top"${area("header")}><div class="wrap">
    <a class="nameplate" href="${fragment("about")}"><b aria-hidden="true">${html(identifier)}</b>${html(name)}</a>
    ${sections.length ? `<nav aria-label="栏目">${sections.map((key) => `<a href="${fragment(key)}">${key === "contact" ? "联系" : html(labels[key])}</a>`).join("")}</nav>` : ""}
  </div></header>
  <main class="wrap" id="about">
    <section class="intro${design.headerAlign === "center" ? " is-centered" : ""}"${area("intro")}>
      <div>${role ? `<p class="role">${html(role)}</p>` : ""}<h1>${html(name)}</h1>${place ? `<p class="location">${html(place)}</p>` : ""}${summary && summaryInIntro ? `<p class="summary"${area("summary")}>${html(summary)}</p>` : ""}${contact?.length ? `<a class="contact-link" href="${fragment("contact")}"${area("button", { bg: palette.accent })}>联系我</a>` : ""}</div>
      <div class="monogram" data-folio-avatar${area("monogram", { bg: palette.art })}><span aria-hidden="true">${html(identifier)}</span></div>
    </section>
    ${bodySections}
  </main>
  <footer${area("footer")}><div class="wrap">${html(name)}${role ? ` · ${html(role)}` : ""}</div></footer>
</body>
</html>`;
  }

  return Object.freeze({ themes, fields, examples, emptyProfile, applyPrompt, applyModelPatch, updateForm, formFieldValue, getChanges, buildHTML, chooseTheme, themeDisplay, ModelPatchError });
})();
