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
  const hideable = new Set(["summary", "skills", "experience", "projects", "education", "location", "email", "phone", "links", "contact"]);
  const emailPattern = /[a-z\d.!#$%&'*+/=?^_\x60{|}~-]+@[a-z\d-]+(?:\.[a-z\d-]+)+/i;
  const urlPattern = /https?:\/\/[^\s<>"'，。；、！）》】]+/gi;

  function emptyProfile() {
    return {
      name: "", role: "", location: "", email: "", phone: "", links: [], summary: "",
      skills: [], experience: [], projects: [], education: [], theme: "paper", compact: false, hidden: [],
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
    const items = value.split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*+•]\s+|\d+[.)、]\s*)/, ""));
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
      next[field] = listFields.has(field) ? fieldList(field, value) : fieldValue(field, value);
      if (next[field].length && !same(next[field], previous[field])) {
        next.hidden = next.hidden.filter((item) => item !== field);
      }
    }
    return next;
  }

  function same(left, right) {
    return Array.isArray(left) ? left.length === right.length && left.every((item, index) => item === right[index]) : left === right;
  }

  function getChanges(before, after) {
    const changes = Object.keys(fields).filter((field) => !same(before[field], after[field])).map((field) => fields[field]);
    if (before.theme !== after.theme) changes.push("网站主题");
    if (before.compact !== after.compact) changes.push("排版");
    if (!same(before.hidden, after.hidden)) changes.push("展示栏目");
    return changes;
  }

  function applyModelPatch(previous, patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new TypeError("Expected a model patch");
    const profile = { ...previous };
    for (const [field, value] of Object.entries(patch)) {
      if (field === "theme" && typeof value === "string" && Object.hasOwn(themes, value)) {
        profile.theme = value;
      } else if (field === "compact" && typeof value === "boolean") {
        profile.compact = value;
      } else if (field === "hidden" && Array.isArray(value) && value.every((key) => hideable.has(key))) {
        profile.hidden = unique(value);
      } else if (listFields.has(field) && Array.isArray(value) && value.every((item) => typeof item === "string")) {
        profile[field] = fieldList(field, value.join("\n"));
      } else if (Object.hasOwn(fields, field) && !listFields.has(field) && typeof value === "string") {
        profile[field] = fieldValue(field, value);
      } else {
        throw new TypeError("Invalid field in model patch");
      }
    }
    return { profile, changes: getChanges(previous, profile) };
  }

  function cleanLine(line) {
    return line.trim().replace(/^#{1,6}\s*/, "").replace(/^(?:[-*+•]\s+|\d+[.)、]\s*)/, "").replace(/\*\*/g, "").trim();
  }

  function labelFrom(value) {
    return fieldByLabel.get(value.toLowerCase().trim());
  }

  function isCommand(line) {
    return /^(?:请|帮我|我想(?:要|做|制作)|我要(?:做|制作)|做一个|生成|创建|调整|让|换成|改成|添加|补充|隐藏|删除|去掉|展示|显示|保存)|简历网站|个人网站|[?？]$/.test(line);
  }

  function applyStyle(profile, line) {
    if (/^(?:不要|别|取消)/.test(line)) return false;
    const styleRequest = /(?:主题|配色|风格|背景)|(?:换成|换为|改成|改用|调成|切换到|想要|做成|设为).*(?:色|暮蓝|深林|纸白)|^(?:深色|浅色|暗色|纸白|深林|暮蓝|深蓝|夜色)$/i.test(line);
    if (styleRequest) {
      if (/暮蓝|深蓝|蓝色|navy|blue/i.test(line)) profile.theme = "blue";
      else if (/深林|深色|黑色|墨绿|夜色|暗色|dark/i.test(line)) profile.theme = "ink";
      else if (/纸白|米白|浅色|白色|亮色|明亮|light/i.test(line)) profile.theme = "paper";
    }
    if (/留白更多|增加留白|宽松|布局舒展|拉开间距/.test(line)) profile.compact = false;
    else if (/紧凑|减少留白|减少间距/.test(line)) profile.compact = true;
    return styleRequest || /留白|紧凑|间距|宽松/.test(line);
  }

  function applyPrompt(previous, input, first = false) {
    const profile = { ...previous, hidden: [...previous.hidden] };
    const freeText = [];
    const labeled = new Set();
    let section = "";

    function record(field, value, replace = false) {
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
    const inlineHeaders = new RegExp(String.raw`[，,；;]\s*(?:(?:然后|另外|并)\s*)?(?=${nextField})`, "gi");
    for (const source of input.split(/\r?\n/).flatMap((line) => line.split(inlineHeaders))) {
      const line = cleanLine(source);
      if (!line) {
        section = "";
        continue;
      }
      const change = line.match(changePrefix);
      const addition = line.match(addPrefix);
      const visibility = line.match(visibilityPrefix);
      const visibleField = visibility && labelFrom(line.slice(visibility[0].length).replace(/[。！!]$/, "").replace(/(?:栏目|区块|部分|模块|信息)$/, ""));
      if (change) {
        record(labelFrom(change[1]), change[2], true);
        section = "";
        continue;
      }
      if (addition && addition[3]) {
        const append = /添加|补充|新增|加/.test(addition[1]);
        record(labelFrom(addition[2]), addition[3], !append);
        section = "";
        continue;
      }
      if (visibleField && hideable.has(visibleField)) {
        if (/删除/.test(visibility[0])) {
          const empty = emptyProfile();
          const removals = visibleField === "contact" ? ["email", "phone", "links"] : [visibleField];
          for (const field of removals) profile[field] = empty[field];
        } else if (/重新显示|重新展示|恢复|取消隐藏|显示|展示/.test(visibility[0]) && !/不要/.test(visibility[0])) {
          profile.hidden = profile.hidden.filter((field) => field !== visibleField);
        } else if (!profile.hidden.includes(visibleField)) profile.hidden.push(visibleField);
        section = "";
        continue;
      }

      const header = line.match(/^([^：:]{1,30})[：:]\s*(.*)$/);
      const field = labelFrom(header ? header[1] : line);
      if (field) {
        const value = header?.[2] ?? "";
        record(field, value);
        section = !value || listFields.has(field) ? field : "";
        continue;
      }
      if (section && !/^(?:请|帮我|我想|换成|改成|设置|主题|风格|切换到)/.test(line)) {
        if (section === "summary" && labeled.has("summary")) record("summary", `${profile.summary}\n${line}`);
        else record(section, line);
        if (!listFields.has(section) && section !== "summary") section = "";
        continue;
      }
      section = "";
      freeText.push(line);
    }

    const remaining = [];
    for (const line of freeText) {
      const englishIntro = line.match(/^(?:[Mm]y name is|[Ii] am|[Ii]'m)\s+([A-Z][a-z]+(?:[ -][A-Z][a-z]+){1,3})\b/);
      if (englishIntro && !labeled.has("name")) record("name", englishIntro[1]);
      for (const part of line.split(/[。！？!?；;，]|(?<!\d),(?!\d)/)) {
        const clause = part.trim();
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
        if (applyStyle(profile, clause) || mail || urls || isCommand(clause) || englishIntro?.[0] === clause) continue;
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
  const escapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const html = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => escapes[character]);

  function card(value) {
    const detail = value.match(/^(.{1,110}?)[：:]\s*(.+)$/s);
    const headline = (detail?.[1] ?? value).split(/\s*[|｜]\s*/);
    return `<article class="entry"><h3>${html(headline[0])}</h3>${headline.length > 1 ? `<p class="meta">${html(headline.slice(1).join(" · "))}</p>` : ""}${detail ? `<p>${html(detail[2])}</p>` : ""}</article>`;
  }

  function buildHTML(data, { preview = false } = {}) {
    const palette = palettes[data.theme] ?? palettes.paper;
    const visible = (field) => !data.hidden.includes(field);
    const fragment = (id) => (preview ? "about:srcdoc" : "") + "#" + id;
    const name = data.name || "个人简历";
    const role = data.role;
    const summary = visible("summary") ? data.summary : "";
    const place = visible("location") ? data.location : "";
    const identifier = Array.from(name.trim())[0] || "F";
    const details = [
      ["experience", "工作经历"],
      ["projects", "代表项目"],
      ["education", "教育经历"],
    ].filter(([key]) => visible(key) && data[key].length);
    const skills = visible("skills") ? data.skills : [];
    const contact = visible("contact") && [
      visible("email") && data.email && `<a href="mailto:${html(data.email)}">${html(data.email)}</a>`,
      visible("phone") && data.phone && `<a href="tel:${html(data.phone.replace(/[^\d+]/g, ""))}">${html(data.phone)}</a>`,
      ...(visible("links") ? data.links.map(safeLink).filter(Boolean).map((link) =>
        `<a href="${html(link)}" target="_blank" rel="noopener noreferrer">${html(new URL(link).hostname.replace(/^www\./, ""))}</a>`) : []),
    ].filter(Boolean);
    const navLinks = [
      ...details.map(([key, label]) => [key, label]),
      ...(skills.length ? [["skills", "技能"]] : []),
      ...(contact?.length ? [["contact", "联系"]] : []),
    ];
    const title = `${name}${role ? ` · ${role}` : ""}`;

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <meta name="description" content="${html((summary || title).slice(0, 180))}">
  <title>${html(title)}</title>
  <style>
    :root { ${Object.entries(palette).map(([key, value]) => `--${key}:${value};`).join("")} --pace:${data.compact ? ".72" : "1"}; color-scheme:${data.theme === "paper" ? "light" : "dark"}; }
    *, *::before, *::after { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif; line-height:1.6; }
    a { color:inherit; text-decoration:none; }
    a:focus-visible { outline:2px solid var(--accent); outline-offset:4px; }
    h1,h2,h3,p { margin:0; }
    .wrap { width:min(100% - 72px,1040px); margin-inline:auto; }
    .top { border-bottom:1px solid var(--line); }
    .top .wrap { min-height:65px; display:flex; align-items:center; justify-content:space-between; padding-block:10px; flex-wrap:wrap; gap:8px 22px; }
    .nameplate { display:inline-flex; align-items:center; gap:9px; font-weight:730; overflow-wrap:anywhere; }
    .nameplate b { display:grid; place-items:center; flex:none; width:29px; height:29px; border-radius:7px; background:var(--accent); color:var(--bg); font-size:.85rem; }
    nav { display:flex; gap:6px 18px; flex-wrap:wrap; color:var(--faint); font-size:.8125rem; }
    nav a:hover, .links a:hover { color:var(--accent); text-decoration:underline; }
    main { padding-block:calc(49px * var(--pace)) calc(46px * var(--pace)); }
    .intro { display:grid; grid-template-columns:minmax(0,1fr) minmax(132px,34%); align-items:center; gap:24px; padding-block:calc(15px * var(--pace)) calc(44px * var(--pace)); }
    .role { margin-bottom:7px; color:var(--accent); font-size:.875rem; font-weight:700; letter-spacing:.06em; overflow-wrap:anywhere; }
    h1 { color:var(--text); font-size:clamp(2.5rem,7.6vw,5rem); font-weight:760; letter-spacing:-.065em; line-height:1.15; overflow-wrap:anywhere; }
    .location { margin-top:9px; color:var(--faint); font-size:.875rem; }
    .summary { max-width:36rem; margin-top:14px; color:var(--faint); overflow-wrap:anywhere; white-space:pre-wrap; }
    .contact-link { display:inline-flex; align-items:center; min-height:36px; margin-top:17px; padding:4px 13px; background:var(--accent); color:var(--bg); border:1px solid var(--accent); border-radius:8px; font-size:.8125rem; font-weight:660; }
    .contact-link:hover { background:transparent; color:var(--accent); }
    .monogram { display:grid; place-items:center; min-height:160px; aspect-ratio:1.2; position:relative; isolation:isolate; overflow:hidden; background:var(--art); color:var(--accent); border:1px solid var(--line); border-radius:15px; font-family:"Songti SC",Georgia,serif; font-size:clamp(2.5rem,8.7vw,5.5rem); line-height:1; }
    .monogram::after { position:absolute; inset:0; z-index:-1; background:repeating-radial-gradient(ellipse at 50% 50%, transparent 0 12px, var(--ring) 13px 13.7px, transparent 14.2px 21px); opacity:.46; content:""; mask-image:radial-gradient(ellipse at center,transparent 10%, #000 50%); }
    .monogram span { display:grid; place-items:center; width:1.54em; height:1.54em; border:1px solid var(--ring); border-radius:50%; background:var(--art); }
    .section { padding-block:calc(22px * var(--pace)); border-top:1px solid var(--line); scroll-margin-top:14px; }
    .section h2 { margin-bottom:12px; font-size:1.22rem; line-height:1.35; letter-spacing:-.035em; }
    .entries { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
    #experience .entries, #education .entries { grid-template-columns:1fr; }
    .entry { padding:13px 15px; border:1px solid var(--line); background:var(--panel); border-radius:10px; overflow-wrap:anywhere; }
    .entry h3 { font-size:.97rem; font-weight:730; }
    .entry p { margin-top:5px; color:var(--faint); font-size:.875rem; white-space:pre-wrap; }
    .entry .meta { color:var(--accent); font-size:.8rem; }
    .chips,.links { display:flex; flex-wrap:wrap; gap:7px; }
    .chips span,.links a { padding:4px 9px; border:1px solid var(--line); border-radius:100px; color:var(--accent); font-size:.81rem; overflow-wrap:anywhere; max-width:100%; }
    footer { padding-block:15px; border-top:1px solid var(--line); color:var(--faint); font-size:.8125rem; }
    @media (max-width:525px) {
      .wrap { width:calc(100% - 34px); }
      .top .wrap { min-height:53px; gap:5px 13px; }
      nav { gap:4px 9px; }
      main { padding-top:calc(22px * var(--pace)); }
      .intro { gap:13px; grid-template-columns:minmax(0,1fr) 80px; align-items:start; }
      .monogram { min-height:0; aspect-ratio:1; font-size:2rem; border-radius:10px; margin-top:6px; }
      .entries { grid-template-columns:1fr; }
    }
    @media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } }
  </style>
</head>
<body>
  <header class="top"><div class="wrap">
    <a class="nameplate" href="${fragment("about")}"><b aria-hidden="true">${html(identifier)}</b>${html(name)}</a>
    ${navLinks.length ? `<nav aria-label="栏目">${navLinks.map(([key, label]) => `<a href="${fragment(key)}">${label}</a>`).join("")}</nav>` : ""}
  </div></header>
  <main class="wrap" id="about">
    <section class="intro">
      <div>${role ? `<p class="role">${html(role)}</p>` : ""}<h1>${html(name)}</h1>${place ? `<p class="location">${html(place)}</p>` : ""}${summary ? `<p class="summary">${html(summary)}</p>` : ""}${contact?.length ? `<a class="contact-link" href="${fragment("contact")}">联系我</a>` : ""}</div>
      <div class="monogram" aria-hidden="true"><span>${html(identifier)}</span></div>
    </section>
    ${details.map(([key, label]) => `<section class="section" id="${key}"><h2>${label}</h2><div class="entries">${data[key].map(card).join("")}</div></section>`).join("")}
    ${skills.length ? `<section class="section" id="skills"><h2>技能</h2><div class="chips">${skills.map((skill) => `<span>${html(skill)}</span>`).join("")}</div></section>` : ""}
    ${contact?.length ? `<section class="section" id="contact"><h2>联系方式</h2><div class="links">${contact.join("")}</div></section>` : ""}
  </main>
  <footer><div class="wrap">${html(name)}${role ? ` · ${html(role)}` : ""}</div></footer>
</body>
</html>`;
  }

  return Object.freeze({ themes, fields, examples, emptyProfile, applyPrompt, applyModelPatch, updateForm, getChanges, buildHTML });
})();
