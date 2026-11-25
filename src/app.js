"use strict";

(() => {
  const { themes, fields, examples, emptyProfile, applyPrompt, applyModelPatch, updateForm, getChanges, buildHTML } = ResumeStudio;
  const $ = (id) => document.getElementById(id);
  const storageKey = "folio-studio-v1";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const narrowLayout = window.matchMedia("(max-width: 740px)");
  const dates = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const htmlPreview = $("resume-preview");
  const chatInput = $("chat-input");
  const briefInput = $("brief");
  const exampleChips = [...document.querySelectorAll("[data-example]")];
  const paneButtons = [...document.querySelectorAll("[data-pane][aria-pressed]")];
  const pending = new WeakSet();
  const saveFailures = new WeakSet();
  let drafts = [];
  let current = null;
  let example = null;
  let displayedWorkspace = null;
  let displayedMessages = 0;
  let displayedVersion = null;
  let toastTimer;

  try {
    drafts = readDrafts();
  } catch {
    // The editor still works when browser storage is unavailable.
  }

  function readDrafts() {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(stored) ? stored.filter((draft) => draft?.id && Array.isArray(draft.versions) && draft.messages?.length && Array.isArray(draft.messages)) : [];
  }

  function newWorkspace(sample = false) {
    return {
      id: makeId(),
      sample,
      bornAt: new Date().toISOString(),
      updatedAt: null,
      revision: 0,
      messages: [],
      versions: [],
    };
  }

  function makeId() {
    return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function saveWorkspace(workspace) {
    if (workspace.sample) return;
    workspace.updatedAt = new Date().toISOString();
    try {
      const saved = readDrafts();
      const other = saved.find((draft) => draft.id === workspace.id);
      if (other && other.revision !== workspace.revision) {
        workspace.id = makeId();
        workspace.revision = 0;
        if (!$("studio").hidden && current === workspace) updateRoute("studio", workspace.id, true);
        toast("另一标签页更新了原草稿，当前修改已另存。");
      }
      workspace.revision++;
      const merged = [workspace, ...saved.filter((draft) => draft.id !== workspace.id)];
      localStorage.setItem(storageKey, JSON.stringify(merged));
      drafts = merged;
      saveFailures.delete(workspace);
    } catch {
      drafts = [workspace, ...drafts.filter((draft) => draft.id !== workspace.id)];
      saveFailures.add(workspace);
    }
    $("open-drafts").hidden = false;
  }

  function latest(workspace) {
    return workspace.versions.at(-1);
  }

  function addVersion(workspace, profile, label) {
    workspace.versions.push({ profile, label, time: new Date().toISOString() });
  }

  function addMessage(workspace, role, text, error = false) {
    workspace.messages.push(error ? { role, text, error } : { role, text });
  }

  function inView(workspace) {
    return current === workspace && !$("studio").hidden;
  }

  function toast(message) {
    clearTimeout(toastTimer);
    const element = $("toast");
    element.textContent = message;
    element.hidden = false;
    toastTimer = setTimeout(() => { element.hidden = true; }, 3200);
  }

  function updateRoute(route, id = null, replace = false) {
    const url = new URL(location.href);
    url.hash = route ? "#" + route : "";
    if (url.href !== location.href || history.state?.id !== id) {
      const method = replace ? "replaceState" : "pushState";
      try {
        history[method]({ id }, "", url);
      } catch {
        location.hash = url.hash;
      }
    }
  }

  function showHome({ navigate = true, focus = false } = {}) {
    if (navigate) updateRoute("");
    $("home").hidden = false;
    $("studio").hidden = true;
    $("home-nav").hidden = false;
    $("studio-nav").hidden = true;
    $("open-drafts").hidden = drafts.length === 0;
    document.title = "Folio · 简历建站";
    if (navigate) window.scrollTo({ top: 0, behavior: "instant" });
    if (focus) $("brand-link").focus({ preventScroll: true });
  }

  function showWorkspace(workspace, { navigate = true, focus = true } = {}) {
    const changed = current !== workspace || $("studio").hidden;
    current = workspace;
    if (navigate) updateRoute(workspace.sample ? "example" : "studio", workspace.id);
    $("home").hidden = true;
    $("studio").hidden = false;
    $("home-nav").hidden = true;
    $("studio-nav").hidden = false;
    if (changed) {
      chatInput.value = "";
      setPane("chat");
      setDevice(false);
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    renderWorkspace();
    if (focus) $("studio-title").focus({ preventScroll: true });
  }

  function openExample(navigate = true) {
    if (example) {
      showWorkspace(example, { navigate });
      return;
    }
    example = newWorkspace(true);
    showWorkspace(example, { navigate });
    submitMessage(example, examples.designer, { localExample: true });
  }

  function openRoute() {
    if (location.hash === "#example") {
      openExample(false);
      return;
    }
    if (location.hash === "#studio") {
      const id = history.state?.id;
      const workspace = (current?.id === id && current) || drafts.find((draft) => draft.id === id) || drafts[0];
      if (workspace) {
        showWorkspace(workspace, { navigate: false, focus: false });
        return;
      }
      updateRoute("", null, true);
    }
    showHome({ navigate: false });
  }

  function setPane(pane) {
    $("studio-grid").dataset.pane = pane;
    for (const button of paneButtons) button.setAttribute("aria-pressed", String(button.dataset.pane === pane));
  }

  function setDevice(mobile) {
    $("preview-canvas").dataset.device = mobile ? "mobile" : "desktop";
    $("device-desktop").setAttribute("aria-pressed", String(!mobile));
    $("device-mobile").setAttribute("aria-pressed", String(mobile));
  }

  function resizeTextarea(textarea, minimum, maximum) {
    textarea.style.height = "auto";
    textarea.style.height = Math.max(minimum, Math.min(textarea.scrollHeight, maximum)) + "px";
  }

  function paintBrief() {
    $("generate").disabled = !briefInput.value.trim();
    for (const chip of exampleChips) chip.setAttribute("aria-pressed", String(briefInput.value === examples[chip.dataset.example]));
    resizeTextarea(briefInput, 58, 185);
  }

  function paintChatInput() {
    $("send-chat").disabled = !current || pending.has(current) || !chatInput.value.trim();
    resizeTextarea(chatInput, 48, 145);
  }

  function renderWorkspace() {
    const version = latest(current);
    const busy = pending.has(current);
    const failed = current.failed && !busy;
    const profile = version?.profile;
    const name = profile?.name;
    $("studio-title").textContent = name ? name + "的简历网站" : "简历工作台";
    document.title = $("studio-title").textContent + " · Folio";
    const status = $("save-status");
    status.textContent = busy ? "正在处理" : current.sample ? "示例简历" : saveFailures.has(current) ? "本地保存失败" : current.messages.length ? "已保存到本机" : "新草稿";
    status.dataset.state = busy ? "busy" : saveFailures.has(current) ? "error" : "ready";
    for (const id of ["export-site", "open-versions", "open-editor", "select-theme", "open-preview"]) {
      $(id).disabled = !version || busy;
    }
    $("version-number").textContent = current.versions.length;
    $("version-number").hidden = !version;
    $("build-state").hidden = Boolean(version);
    $("update-indicator").hidden = !busy || !version;
    $("update-indicator").textContent = "正在更新预览…";
    $("build-progress").hidden = !busy;
    if (!version) {
      $("build-label").textContent = failed ? "生成未完成" : "正在整理经历";
      $("build-detail").textContent = failed ? "回到对话重试，或检查模型设置" : "读取个人资料、项目和技能";
    }
    if (displayedVersion !== version) {
      displayedVersion = version;
      if (version) htmlPreview.srcdoc = buildHTML(profile, { preview: true });
      else htmlPreview.removeAttribute("srcdoc");
    }
    htmlPreview.hidden = !version;
    $("select-theme").value = profile?.theme || "paper";
    $("theme-dot").dataset.theme = profile?.theme || "paper";
    $("suggest-theme").textContent = profile?.theme === "ink" ? "换成纸白" : "换成深色";
    $("chat-suggestions").hidden = !version || busy || failed;
    $("retry-chat").hidden = !failed;
    renderMessages();
    paintChatInput();
  }

  function element(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text) item.textContent = text;
    return item;
  }

  function messageNode(message, typing = false) {
    const node = element("article", "message");
    node.dataset.role = message.role;
    if (message.error) node.dataset.error = "true";
    const byUser = message.role === "user";
    if (!byUser) {
      const badge = element("span", "message-icon");
      badge.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-spark"></use></svg>';
      node.append(badge);
    }
    const wrapper = byUser ? node : element("div");
    const author = element("p", "message-author", byUser ? "你" : "Folio");
    const body = element("div", "message-body");
    if (typing) {
      body.append(element("span", "sr-only", "正在整理网站"));
      const dots = element("span", "typing");
      dots.setAttribute("aria-hidden", "true");
      dots.append(element("span"), element("span"), element("span"));
      body.append(dots);
    } else if (byUser && (message.text.length > 290 || message.text.split("\n").length > 6)) {
      const clip = message.text.split("\n").slice(0, 3).join("\n").slice(0, 170);
      body.append(element("p", "", clip.trimEnd() + "…"));
      const details = element("details", "message-details");
      details.append(element("summary", "", "查看完整描述"), element("p", "", message.text));
      body.append(details);
    } else {
      body.textContent = message.text;
    }
    wrapper.append(author, body);
    if (!byUser) node.append(wrapper);
    return node;
  }

  function renderMessages() {
    const messages = $("messages");
    if (displayedWorkspace !== current) {
      displayedWorkspace = current;
      displayedMessages = 0;
      messages.replaceChildren();
    }
    messages.querySelector("[data-typing]")?.remove();
    for (const message of current.messages.slice(displayedMessages)) messages.append(messageNode(message));
    displayedMessages = current.messages.length;
    if (pending.has(current)) {
      const placeholder = messageNode({ role: "assistant" }, true);
      placeholder.dataset.typing = "";
      messages.append(placeholder);
    }
    $("chat-scroll").scrollTop = $("chat-scroll").scrollHeight;
  }

  function resultMessage(profile, changes, isFirst) {
    if (isFirst && !profile.name) return "简历网站已生成。可以接着发「姓名：王小宁，职位：产品设计师」，或打开「编辑资料」填写。";
    if (isFirst) return "简历网站已生成。可以继续加项目、补联系方式，或发「换成深色主题」看看效果。";
    if (!changes.length) return "这条消息没有产生更新。可以试试「简介改成：……」「项目：……」或「隐藏教育经历」，也可以直接编辑资料。";
    if (changes.length === 1 && changes[0] === "网站主题") return "主题已换成「" + themes[profile.theme] + "」。";
    return "已更新" + changes.join("、") + "。";
  }

  async function composeWithModel(workspace, previous, content, first) {
    if (inView(workspace)) {
      $(first ? "build-label" : "update-indicator").textContent = "正在调用模型…";
      if (first) $("build-detail").textContent = "等待模型整理简历资料";
    }
    const lastUserIndex = workspace.messages.findLastIndex((message) => message.role === "user");
    const history = workspace.messages.slice(0, lastUserIndex).filter((message) => !message.error);
    const result = await FolioModel.chat(previous, content, history);
    try {
      return { ...applyModelPatch(previous, result.patch), reply: result.reply };
    } catch {
      throw new FolioModel.RequestError("invalid_model_output", "模型返回的简历字段不符合格式。可以重试，或换一个模型。");
    }
  }

  async function submitMessage(workspace, content, { retry = false, localExample = false } = {}) {
    if (!content || pending.has(workspace)) return;
    pending.add(workspace);
    if (!retry) addMessage(workspace, "user", content);
    workspace.failed = false;
    if (inView(workspace)) renderWorkspace();

    const prior = latest(workspace);
    const isFirst = !prior;
    const previous = prior?.profile ?? emptyProfile();
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, reducedMotion.matches ? 0 : ms));
    try {
      const config = localExample ? null : await FolioModel.loadSettings();
      let result;
      if (config?.configured) {
        result = await composeWithModel(workspace, previous, content, isFirst);
      } else {
        await pause(isFirst ? 300 : 160);
        result = applyPrompt(previous, content, isFirst);
        if (isFirst && inView(workspace)) {
          $("build-label").textContent = "正在生成网站";
          $("build-detail").textContent = "排版并准备实时预览";
        }
        await pause(isFirst ? 300 : 150);
      }
      const { profile, changes, reply } = result;
      if (isFirst || changes.length) addVersion(workspace, profile, isFirst ? "生成初稿" : changes.join("、"));
      addMessage(workspace, "assistant", reply || resultMessage(profile, changes, isFirst));
    } catch (error) {
      const message = error instanceof FolioModel.RequestError ? error.message : "处理出错了，请重试。";
      workspace.failed = true;
      addMessage(workspace, "assistant", message, true);
    } finally {
      saveWorkspace(workspace);
      pending.delete(workspace);
      if (inView(workspace)) {
        renderWorkspace();
        if (isFirst && !workspace.failed && narrowLayout.matches) setPane("preview");
      }
    }
  }

  function appendDirectEdit(profile, description, message) {
    addVersion(current, profile, description);
    addMessage(current, "assistant", message);
    saveWorkspace(current);
    renderWorkspace();
  }

  function setExample(key) {
    $("file-note").hidden = true;
    briefInput.value = examples[key];
    paintBrief();
    briefInput.focus({ preventScroll: true });
    briefInput.setSelectionRange(0, 0);
    briefInput.scrollTop = 0;
  }

  function keySubmit(event) {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (event.currentTarget.value.trim()) event.currentTarget.form.requestSubmit();
  }

  function fileFeedback(text, error = false) {
    const note = $("file-note");
    note.textContent = text;
    note.dataset.kind = error ? "error" : "success";
    note.hidden = false;
  }

  async function importFile(file) {
    if (!file) return;
    if (!/\.(?:txt|md|markdown)$/i.test(file.name)) {
      fileFeedback("请选择 .txt 或 .md 文本文件。", true);
      return;
    }
    try {
      if (file.size > 80000) {
        fileFeedback("文本超过 20,000 字符，请分段粘贴。", true);
        return;
      }
      const read = (await file.text()).replace(/^\uFEFF/, "").trim();
      if (!read) {
        fileFeedback("这份文件没有可导入的内容。", true);
        return;
      }
      const imported = [briefInput.value.trim(), read].filter(Boolean).join("\n\n");
      if (imported.length > briefInput.maxLength) {
        fileFeedback("内容超过 20,000 字符，请分段粘贴。", true);
        return;
      }
      briefInput.value = imported;
      paintBrief();
      briefInput.focus({ preventScroll: true });
      fileFeedback("已导入 " + file.name + "，可以在发送前继续编辑。");
    } catch {
      fileFeedback("读取文件失败，请复制文本后粘贴。", true);
    }
  }

  function datedItem(name, timestamp, action) {
    const row = element("div", "list-item");
    const text = element("div");
    const time = element("time", "", dates.format(new Date(timestamp)));
    time.dateTime = timestamp;
    text.append(element("strong", "", name), time);
    row.append(text, action);
    return row;
  }

  function actionButton(label, click) {
    const button = element("button", "button button-outline", label);
    button.type = "button";
    button.addEventListener("click", click);
    return button;
  }

  function showDrafts() {
    const list = $("drafts-list");
    list.replaceChildren();
    for (const draft of drafts) {
      const action = actionButton("继续编辑", () => {
        $("drafts-dialog").close();
        showWorkspace(draft);
      });
      const profile = latest(draft)?.profile;
      const name = profile?.name || profile?.role || "未命名简历";
      list.append(datedItem(name, draft.updatedAt || draft.bornAt, action));
    }
    $("drafts-dialog").showModal();
  }

  function showVersions() {
    const list = $("versions-list");
    list.replaceChildren();
    const versions = current.versions;
    for (const [index, version] of [...versions.entries()].reverse()) {
      const number = index + 1;
      const action = number === versions.length ? element("span", "current", "当前版本") : actionButton("恢复", () => {
        $("versions-dialog").close();
        appendDirectEdit(version.profile, "恢复自 V" + number, "已恢复 V" + number + "，恢复前的版本仍可在历史中查看。");
        toast("已恢复 V" + number);
      });
      list.append(datedItem("V" + number + " · " + version.label, version.time, action));
    }
    $("versions-dialog").showModal();
  }

  function showProfileForm() {
    const profile = latest(current).profile;
    const form = $("profile-form");
    for (const key of Object.keys(fields)) {
      const value = profile[key];
      form.elements.namedItem(key).value = Array.isArray(value)
        ? value.join(["skills", "links"].includes(key) ? "、" : "\n")
        : value;
    }
    $("edit-dialog").showModal();
  }

  function exportWebsite() {
    const profile = latest(current)?.profile;
    if (!profile) return;
    const file = new Blob([buildHTML(profile)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const filename = profile.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim().slice(0, 60) || "简历网站";
    const link = element("a");
    link.href = url;
    link.download = filename + ".html";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast("已开始下载 HTML 文件");
  }

  $("brand-link").addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    showHome({ focus: true });
  });
  document.querySelector(".skip-link").addEventListener("click", (event) => {
    event.preventDefault();
    $("main-content").focus();
  });
  $("open-example").addEventListener("click", () => openExample());
  $("open-drafts").addEventListener("click", showDrafts);
  $("brief-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const content = briefInput.value.trim();
    if (!content) return;
    const workspace = newWorkspace();
    showWorkspace(workspace);
    briefInput.value = "";
    $("file-note").hidden = true;
    paintBrief();
    submitMessage(workspace, content);
  });
  briefInput.addEventListener("input", () => {
    $("file-note").hidden = true;
    paintBrief();
  });
  briefInput.addEventListener("keydown", keySubmit);
  for (const chip of exampleChips) chip.addEventListener("click", () => setExample(chip.dataset.example));
  $("import-brief").addEventListener("click", () => $("brief-file").click());
  $("brief-file").addEventListener("change", (event) => {
    importFile(event.currentTarget.files[0]);
    event.currentTarget.value = "";
  });
  $("chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const content = chatInput.value.trim();
    if (!content || pending.has(current)) return;
    chatInput.value = "";
    submitMessage(current, content);
  });
  chatInput.addEventListener("input", paintChatInput);
  chatInput.addEventListener("keydown", keySubmit);
  $("retry-chat").addEventListener("click", () => {
    const message = current?.messages.findLast((item) => item.role === "user");
    if (current?.failed && message) submitMessage(current, message.text, { retry: true });
  });
  $("suggest-theme").addEventListener("click", () => {
    submitMessage(current, latest(current)?.profile.theme === "ink" ? "换成纸白主题" : "换成深色主题");
  });
  for (const [id, text] of [["suggest-contact", "邮箱："], ["suggest-project", "项目："]]) {
    $(id).addEventListener("click", () => {
      chatInput.value = chatInput.value.trim() ? chatInput.value.trimEnd() + "\n" + text : text;
      chatInput.focus();
      chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
      paintChatInput();
    });
  }
  for (const button of paneButtons) button.addEventListener("click", () => setPane(button.dataset.pane));
  $("device-desktop").addEventListener("click", () => setDevice(false));
  $("device-mobile").addEventListener("click", () => setDevice(true));
  $("select-theme").addEventListener("change", (event) => {
    const theme = event.currentTarget.value;
    const profile = latest(current).profile;
    if (profile.theme !== theme && Object.hasOwn(themes, theme)) {
      appendDirectEdit({ ...profile, theme }, "主题 · " + themes[theme], "已将主题换成「" + themes[theme] + "」。");
    }
  });
  $("open-editor").addEventListener("click", showProfileForm);
  $("profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const previous = latest(current).profile;
    const profile = updateForm(previous, new FormData(event.currentTarget));
    const changes = getChanges(previous, profile);
    $("edit-dialog").close();
    if (changes.length) appendDirectEdit(profile, "编辑资料", resultMessage(profile, changes, false));
    else toast("资料未改动");
  });
  $("open-versions").addEventListener("click", showVersions);
  $("open-preview").addEventListener("click", () => {
    $("full-preview").srcdoc = buildHTML(latest(current).profile, { preview: true });
    $("full-dialog").showModal();
  });
  $("full-dialog").addEventListener("close", () => $("full-preview").removeAttribute("srcdoc"));
  $("export-site").addEventListener("click", exportWebsite);
  for (const button of document.querySelectorAll("[data-close]")) {
    button.addEventListener("click", () => button.closest("dialog").close());
  }
  window.addEventListener("popstate", openRoute);
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) return;
    try {
      drafts = readDrafts();
      $("open-drafts").hidden = drafts.length === 0;
    } catch {
      // Keep the known drafts if another tab's write cannot be read.
    }
  });
  openRoute();
  paintBrief();
})();
