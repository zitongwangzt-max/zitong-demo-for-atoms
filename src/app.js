"use strict";

(() => {
  const { themes, fields, examples, emptyProfile, applyPrompt, applyModelPatch, updateForm, formFieldValue, getChanges, buildHTML, chooseTheme, themeDisplay, ModelPatchError } = ResumeStudio;
  const $ = (id) => document.getElementById(id);
  const modelHTMLLimit = 120000;
  const sourcePolicy = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'";
  const excludedSourceTags = new Set(["applet", "base", "embed", "frame", "frameset", "iframe", "link", "object", "portal", "script", "template", "animate", "animateMotion", "animateTransform", "set", "foreignObject"]);
  const storageKey = "folio-studio-v1";
  const publishedPathPattern = /^\/page\/[A-Za-z0-9_-]{22}$/;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const narrowLayout = window.matchMedia("(max-width: 740px)");
  const dates = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const htmlPreview = $("resume-preview");
  const fullPreview = $("full-preview");
  const codeInput = $("html-source");
  const chatInput = $("chat-input");
  const briefInput = $("brief");
  const publishDialog = $("publish-dialog");
  const publishURL = $("publish-url");
  const exampleChips = [...document.querySelectorAll("[data-example]")];
  const paneButtons = [...document.querySelectorAll("[data-pane][aria-pressed]")];
  const outputButtons = [...document.querySelectorAll("[data-output-view]")];
  const pending = new WeakSet();
  const publishing = new WeakSet();
  const codeDrafts = new WeakMap();
  const saveFailures = new WeakSet();
  let drafts = [];
  let current = null;
  let example = null;
  let displayedWorkspace = null;
  let displayedMessages = 0;
  let displayedVersion = null;
  let displayedHTML = "";
  let codeEditor = null;
  let publication = null;
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

  function addVersion(workspace, profile, label, html, avatarId = latest(workspace)?.avatarId) {
    const version = { profile, label, time: new Date().toISOString() };
    if (html !== undefined) version.html = html;
    if (avatarId) version.avatarId = avatarId;
    workspace.versions.push(version);
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
      setOutputView("preview");
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

  function setOutputView(view) {
    const showingCode = view === "code";
    $("preview-canvas").hidden = showingCode;
    $("preview-controls").hidden = showingCode;
    $("code-canvas").hidden = !showingCode;
    for (const button of outputButtons) button.setAttribute("aria-pressed", String(button.dataset.outputView === view));
    if (showingCode && !codeEditor && typeof FolioEditor !== "undefined") {
      const mount = $("html-editor");
      mount.hidden = false;
      codeInput.hidden = true;
      codeEditor = FolioEditor.create(mount, currentCode(), trackCodeChange);
      $("format-code").hidden = false;
    }
    if (showingCode) codeEditor?.measure();
    renderCodeControls();
  }

  function currentCode() {
    return codeDrafts.get(current) ?? displayedHTML;
  }

  function syncCodeEditor() {
    const source = currentCode();
    if (codeEditor) codeEditor.setSource(source);
    else codeInput.value = source;
  }

  function trackCodeChange(source) {
    if (!displayedVersion) return;
    if (source === displayedHTML) codeDrafts.delete(current);
    else codeDrafts.set(current, source);
    renderCodeControls();
  }

  function renderCodeControls() {
    const ready = Boolean(displayedVersion) && !pending.has(current);
    const dirty = codeDrafts.has(current);
    const hasCode = Boolean(currentCode().trim());
    $("code-status").hidden = !dirty;
    $("discard-code").hidden = !dirty;
    $("discard-code").disabled = !ready;
    $("apply-code").disabled = !ready || !dirty || !hasCode;
    $("download-code").disabled = !ready || !hasCode;
    $("format-code").disabled = !ready || !hasCode;
  }

  function serializePage(page) {
    const doctype = page.doctype ? new XMLSerializer().serializeToString(page.doctype) + "\n" : "";
    return doctype + page.documentElement.outerHTML;
  }

  function cleanModelSource(source) {
    if (typeof source !== "string" || source.length > modelHTMLLimit || !/^<!doctype\s+html\s*>[\s\S]*<html\b[\s\S]*<body\b[\s\S]*<\/html\s*>$/i.test(source.trim())) {
      throw new TypeError("Expected a complete HTML document");
    }
    const page = new DOMParser().parseFromString(source, "text/html");
    for (const node of page.querySelectorAll("*")) {
      if (excludedSourceTags.has(node.localName) || node.matches("meta[http-equiv]")) {
        node.remove();
        continue;
      }
      for (const { name, value } of [...node.attributes]) {
        const attribute = name.toLowerCase();
        if (/^on|^(?:action|autofocus|background|formaction|manifest|ping|poster|srcdoc|srcset)$/.test(attribute)) {
          node.removeAttribute(name);
        } else if (attribute === "href" || attribute === "xlink:href") {
          const link = value.trim();
          const anchor = node.localName === "a" || node.localName === "area";
          if (/[\u0000-\u001f\u007f]/.test(link) || (!link.startsWith("#") && !(anchor && /^(?:https?:\/\/|mailto:|tel:)/i.test(link)))) {
            node.removeAttribute(name);
          }
        } else if (attribute === "src" && !(node.localName === "img" && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z\d+/=\s]+$/i.test(value))) {
          node.removeAttribute(name);
        }
      }
      if (node.matches('a[target="_blank"], area[target="_blank"]')) node.setAttribute("rel", "noopener noreferrer");
    }
    const policy = page.createElement("meta");
    policy.httpEquiv = "Content-Security-Policy";
    policy.content = sourcePolicy;
    page.head.prepend(policy);
    return serializePage(page);
  }

  function baseWebsiteSource(version) {
    return typeof version.html === "string" ? version.html : buildHTML(version.profile);
  }

  function avatarSlot(page) {
    return page?.querySelector("[data-folio-avatar], .monogram");
  }

  function sourceWithPhoto(source, photoURL) {
    const page = new DOMParser().parseFromString(source, "text/html");
    const slot = avatarSlot(page);
    if (!slot) return source;
    slot.querySelector("img[data-folio-avatar-photo]")?.remove();
    const photo = page.createElement("img");
    photo.setAttribute("data-folio-avatar-photo", "");
    photo.src = photoURL;
    photo.alt = "头像";
    photo.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:var(--area-bg,var(--art,#edf0f8))";
    slot.append(photo);
    for (const policy of page.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]')) {
      policy.content = policy.content
        .replace("style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
          "style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'")
        .replace("img-src data:;", "img-src 'self' data:;");
    }
    return serializePage(page);
  }

  function websiteSource(version) {
    const source = baseWebsiteSource(version);
    const asset = FolioAvatar.assetURL(version.avatarId);
    return asset ? sourceWithPhoto(source, new URL(asset, location.href).href) : source;
  }

  function previewSource(version) {
    const page = new DOMParser().parseFromString(websiteSource(version), "text/html");
    for (const link of page.querySelectorAll('a[href^="#"], area[href^="#"]')) {
      link.setAttribute("href", "about:srcdoc" + link.getAttribute("href"));
    }
    const slot = avatarSlot(page);
    if (slot) {
      const label = version.avatarId ? "更换头像" : "上传头像";
      slot.removeAttribute("aria-hidden");
      slot.setAttribute("data-folio-avatar", "");
      slot.setAttribute("role", "button");
      slot.setAttribute("aria-label", label);
      slot.setAttribute("tabindex", "0");
      slot.style.cursor = "pointer";
      const hint = page.createElement("small");
      hint.setAttribute("aria-hidden", "true");
      hint.textContent = label;
      hint.style.cssText = "position:absolute;right:6px;bottom:6px;padding:4px 6px;border-radius:6px;background:#fff;color:#172944;font:600 11px/1 system-ui,sans-serif;z-index:2";
      slot.append(hint);
    }
    return serializePage(page);
  }

  async function updateAvatar(workspace, version, file) {
    if (!file || pending.has(workspace) || latest(workspace) !== version) return;
    pending.add(workspace);
    if (inView(workspace)) {
      renderWorkspace();
      $("update-indicator").textContent = "正在上传头像…";
    }
    try {
      const result = await FolioAvatar.upload(file, "/api/avatars");
      if (!FolioAvatar.assetURL(result.id)) throw new Error("头像服务未返回可用图片，请重试。");
      addVersion(workspace, version.profile, "更新头像", version.html, result.id);
      addMessage(workspace, "assistant", "头像已更新。");
      saveWorkspace(workspace);
    } catch (error) {
      if (inView(workspace)) {
        addMessage(workspace, "assistant", error.message, true);
        saveWorkspace(workspace);
      }
    } finally {
      pending.delete(workspace);
      if (inView(workspace)) {
        renderWorkspace();
        if ($("full-dialog").open) fullPreview.srcdoc = previewSource(latest(workspace));
      }
    }
  }

  function enablePreviewAvatar(frame) {
    frame.addEventListener("load", () => {
      const document = frame.contentDocument;
      if (document?.URL !== "about:srcdoc" || !current) return;
      const slot = avatarSlot(document);
      if (!slot) return;
      const workspace = current;
      const version = latest(workspace);
      const input = document.createElement("input");
      input.type = "file";
      input.accept = FolioAvatar.allowedFiles;
      input.setAttribute("aria-label", "选择头像图片");
      input.hidden = true;
      document.body.append(input);
      input.addEventListener("change", () => updateAvatar(workspace, version, input.files[0]));
      function pick(event) {
        event.preventDefault();
        if (pending.has(workspace) || !version || latest(workspace) !== version) return;
        input.value = "";
        input.click();
      }
      slot.addEventListener("click", pick);
      slot.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") pick(event);
      });
    });
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
    for (const id of ["export-site", "open-publish", "open-versions", "open-editor", "select-theme", "open-preview"]) {
      $(id).disabled = !version || busy;
    }
    $("open-publish").title = publicationURL(version?.publishedPath) ? "查看发布链接" : "发布当前版本";
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
      displayedHTML = version ? websiteSource(version) : "";
      $("code-filename").textContent = version ? exportFilename(profile.name) : "index.html";
      if (version) htmlPreview.srcdoc = previewSource(version);
      else htmlPreview.removeAttribute("srcdoc");
    }
    $("code-scroll").hidden = !version;
    $("code-empty").hidden = Boolean(version);
    syncCodeEditor();
    renderCodeControls();
    htmlPreview.hidden = !version;
    const theme = themeDisplay(profile);
    $("select-theme").value = theme.value;
    $("theme-dot").dataset.theme = theme.value;
    $("theme-dot").style.backgroundColor = theme.color;
    $("suggest-theme").textContent = theme.dark ? "换成浅色" : "换成深色";
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

  function resultMessage(profile, changes, isFirst, previous) {
    if (isFirst && !profile.name) return "简历网站已生成。可以接着发「姓名：王小宁，职位：产品设计师」，或打开「编辑资料」填写。";
    if (isFirst) return "简历网站已生成。可以继续加项目、补联系方式，或发「换成深色主题」看看效果。";
    if (!changes.length) return "这条消息没有产生更新。可以试试「主色用 #7C3AED」「把项目移到工作经历前面」或「简介改成：……」。";
    const added = (profile.customSections ?? []).filter((section) => previous && !previous.customSections?.some((item) => item.id === section.id));
    if (added.length) {
      const names = added.map((section) => "「" + section.title + "」").join("、");
      const empty = added.find((section) => !section.entries.length);
      return "已新增" + names + "栏目。" + (empty ? "可以继续用「" + empty.title + "：……」添加内容。" : "");
    }
    if (changes.length === 1 && changes[0] === "网站主题") {
      return themeDisplay(profile).value === "custom" ? "已更新自定义配色。" : "主题已换成「" + themes[profile.theme] + "」。";
    }
    return "已更新" + changes.join("、") + "。";
  }

  function readModelUpdate(previous, result, source, sourceEdited) {
    const update = applyModelPatch(previous, result.patch);
    if (result.html !== undefined) {
      try {
        update.html = cleanModelSource(result.html);
      } catch {
        throw new ModelPatchError("html");
      }
      if (update.html !== source) update.changes.push("HTML 源码");
    } else if (sourceEdited && update.changes.length) {
      throw new ModelPatchError("html");
    }
    const questions = Array.isArray(result.questions) ? result.questions : [];
    const followUp = questions.length ? "\n\n" + questions.map((question, index) => `${index + 1}. ${question}`).join("\n") : "";
    return { ...update, reply: result.reply + followUp };
  }

  async function composeWithModel(workspace, previous, content, version) {
    const first = !version;
    const status = $(first ? "build-label" : "update-indicator");
    if (inView(workspace)) {
      status.textContent = "正在调用模型…";
      if (first) $("build-detail").textContent = "正在梳理经历、岗位方向和待补资料";
    }
    const lastUserIndex = workspace.messages.findLastIndex((message) => message.role === "user");
    const history = workspace.messages.slice(0, lastUserIndex).filter((message) => !message.error);
    const sourceEdited = typeof version?.html === "string";
    const source = sourceEdited ? version.html : version ? buildHTML(previous) : undefined;
    if (sourceEdited && source.length > modelHTMLLimit) {
      throw new FolioModel.RequestError("invalid_html", "当前 HTML 太长，精简后可继续用对话修改。");
    }
    const options = { phase: first ? "initial" : "revision" };
    if (source?.length <= modelHTMLLimit) Object.assign(options, { html: source, sourceEdited });
    while (true) {
      try {
        const result = await FolioModel.chat(previous, content, history, options);
        return readModelUpdate(previous, result, source, sourceEdited);
      } catch (error) {
        const field = error instanceof ModelPatchError ? error.field
          : error instanceof FolioModel.RequestError && error.code === "invalid_model_output" ? "patch" : null;
        if (!field) throw error;
        if (options.formatCorrection) {
          const message = field === "html" ? "模型返回的 HTML 未通过校验。可重试本条修改。"
            : `模型返回的字段格式有误（${field}）。可重试本条修改。`;
          throw new FolioModel.RequestError("invalid_model_output", message);
        }
        options.formatCorrection = field;
        if (inView(workspace)) status.textContent = "正在校正模型返回格式…";
      }
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
    if (isFirst && localExample) previous.design.colors.accent = "#2459cf";
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, reducedMotion.matches ? 0 : ms));
    try {
      const config = localExample ? null : await FolioModel.loadSettings();
      let result;
      if (config?.configured) {
        result = await composeWithModel(workspace, previous, content, prior);
      } else {
        if (typeof prior?.html === "string") {
          throw new FolioModel.RequestError("model_not_configured", "这份 HTML 可以从「代码」继续编辑。配置模型后可用对话修改源码。");
        }
        await pause(isFirst ? 300 : 160);
        result = applyPrompt(previous, content, isFirst);
        if (isFirst && inView(workspace)) {
          $("build-label").textContent = "正在生成网站";
          $("build-detail").textContent = "排版并准备实时预览";
        }
        await pause(isFirst ? 300 : 150);
      }
      const { profile, changes, reply, html } = result;
      if (isFirst || changes.length) addVersion(workspace, profile, isFirst ? "生成初稿" : changes.join("、"), html);
      addMessage(workspace, "assistant", reply || resultMessage(profile, changes, isFirst, previous));
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

  function appendDirectEdit(profile, description, message, html, avatarId) {
    addVersion(current, profile, description, html, avatarId);
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

  function datedItem(name, timestamp, action, link) {
    const row = element("div", "list-item");
    const text = element("div");
    const time = element("time", "", dates.format(new Date(timestamp)));
    time.dateTime = timestamp;
    text.append(element("strong", "", name), time);
    if (link) text.append(link);
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
        appendDirectEdit(version.profile, "恢复自 V" + number, "已恢复 V" + number + "，恢复前的版本仍可在历史中查看。", version.html, version.avatarId ?? null);
        toast("已恢复 V" + number);
      });
      const url = publicationURL(version.publishedPath);
      let link;
      if (url) {
        link = element("a", "published-version-link", "打开发布页");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", "打开 V" + number + " 发布页");
      }
      list.append(datedItem("V" + number + " · " + version.label, version.time, action, link));
    }
    $("versions-dialog").showModal();
  }

  function showProfileForm() {
    const profile = latest(current).profile;
    const form = $("profile-form");
    for (const key of Object.keys(fields)) {
      form.elements.namedItem(key).value = formFieldValue(key, profile[key]);
    }
    $("edit-dialog").showModal();
  }

  function exportFilename(name) {
    const safeName = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim().slice(0, 60) || "简历网站";
    return safeName + ".html";
  }

  async function exportWebsite(html) {
    const version = displayedVersion;
    if (!version || !html.trim()) return;
    if (version.avatarId) {
      try {
        html = sourceWithPhoto(html, await FolioAvatar.embeddedPhoto(version.avatarId));
      } catch {
        toast("暂时无法读取头像，请重试下载。");
        return;
      }
    }
    const file = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = element("a");
    link.href = url;
    link.download = exportFilename(version.profile.name);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast("已开始下载 HTML 文件");
  }

  function publicationURL(path) {
    return typeof path === "string" && publishedPathPattern.test(path) && /^https?:$/.test(location.protocol)
      ? new URL(path, location.origin).href : "";
  }

  function publishFeedback(message = "", error = false) {
    const feedback = $("publish-feedback");
    feedback.textContent = message;
    feedback.hidden = !message;
    feedback.dataset.error = String(error);
  }

  function renderPublishDialog() {
    const version = publication.version;
    const url = publicationURL(version.publishedPath);
    const busy = publishing.has(version);
    $("publish-description").textContent = url ? "持有链接的人都可以打开这个版本。" : "发布当前预览版本。任何持有链接的人都可以打开。";
    $("publish-field").hidden = !url;
    publishURL.value = url;
    $("open-published").hidden = !url;
    if (url) $("open-published").href = url;
    else $("open-published").removeAttribute("href");
    $("copy-published").hidden = !url;
    const confirm = $("publish-confirm");
    confirm.hidden = Boolean(url);
    confirm.disabled = busy;
    confirm.textContent = busy ? "正在发布…" : "发布当前版本";
  }

  function openPublishDialog() {
    if (!displayedVersion || !displayedHTML.trim() || pending.has(current)) return;
    publication = { workspace: current, version: displayedVersion };
    publishFeedback();
    renderPublishDialog();
    publishDialog.showModal();
  }

  async function requestPublication(version) {
    if (!/^https?:$/.test(location.protocol)) throw new Error("请通过 Folio 服务打开页面后再发布。");
    let response;
    try {
      response = await fetch("/api/publish", {
        method: "POST",
        cache: "no-store",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: baseWebsiteSource(version), avatarId: version.avatarId }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error("发布服务暂时无法连接，请重试。");
    }
    if (response.status === 404) throw new Error("当前服务器未启用发布功能。");
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.message || "发布失败，请重试。");
    if (!publicationURL(result?.path)) throw new Error("发布服务未返回可用链接，请重试。");
    return result.path;
  }

  async function publishVersion() {
    if (!publication) return;
    const { workspace, version } = publication;
    if (publishing.has(version) || publicationURL(version.publishedPath)) return;
    publishing.add(version);
    publishFeedback();
    renderPublishDialog();
    let error;
    try {
      version.publishedPath = await requestPublication(version);
      saveWorkspace(workspace);
      if (inView(workspace)) renderWorkspace();
    } catch (failure) {
      error = failure;
    } finally {
      publishing.delete(version);
      if (publication?.version === version && publishDialog.open) {
        renderPublishDialog();
        if (error) publishFeedback(error.message, true);
        else $("copy-published").focus();
      }
    }
  }

  async function copyPublication() {
    try {
      await navigator.clipboard.writeText(publishURL.value);
    } catch {
      publishURL.focus();
      publishURL.select();
      if (!document.execCommand?.("copy")) {
        publishFeedback("链接已选中，可以手动复制。");
        return;
      }
    }
    publishFeedback("链接已复制。");
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
    submitMessage(current, themeDisplay(latest(current)?.profile).dark ? "换成浅色主题" : "换成深色主题");
  });
  for (const [id, text] of [
    ["suggest-style", "换成雾霾蓝主题，只把页脚背景改成 #231942"],
    ["suggest-section", "新增一个荣誉获奖栏目"],
    ["suggest-contact", "邮箱："], ["suggest-project", "项目："],
  ]) {
    $(id).addEventListener("click", () => {
      chatInput.value = chatInput.value.trim() ? chatInput.value.trimEnd() + "\n" + text : text;
      chatInput.focus();
      chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
      paintChatInput();
    });
  }
  for (const button of paneButtons) button.addEventListener("click", () => setPane(button.dataset.pane));
  for (const button of outputButtons) button.addEventListener("click", () => setOutputView(button.dataset.outputView));
  $("device-desktop").addEventListener("click", () => setDevice(false));
  $("device-mobile").addEventListener("click", () => setDevice(true));
  $("select-theme").addEventListener("change", (event) => {
    const theme = event.currentTarget.value;
    const version = latest(current);
    const { profile } = version;
    if (themeDisplay(profile).value !== theme && Object.hasOwn(themes, theme)) {
      const title = themes[theme];
      if (typeof version.html === "string") submitMessage(current, "把当前网页改成「" + title + "」预设主题。");
      else appendDirectEdit(chooseTheme(profile, theme), "主题 · " + title, "已将主题换成「" + title + "」。");
    }
  });
  $("open-editor").addEventListener("click", showProfileForm);
  $("profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const version = latest(current);
    const profile = updateForm(version.profile, new FormData(event.currentTarget));
    const changes = getChanges(version.profile, profile);
    $("edit-dialog").close();
    if (!changes.length) {
      toast("资料未改动");
      return;
    }
    if (typeof version.html === "string") {
      const updates = Object.keys(fields).filter((key) => changes.includes(fields[key])).map((key) =>
        fields[key] + "：" + formFieldValue(key, profile[key]));
      submitMessage(current, "按以下资料更新当前网页。值为空的字段清空。\n" + updates.join("\n"));
    } else {
      appendDirectEdit(profile, "编辑资料", resultMessage(profile, changes, false, version.profile));
    }
  });
  $("open-versions").addEventListener("click", showVersions);
  $("open-preview").addEventListener("click", () => {
    fullPreview.srcdoc = previewSource(latest(current));
    $("full-dialog").showModal();
  });
  $("full-dialog").addEventListener("close", () => fullPreview.removeAttribute("srcdoc"));
  enablePreviewAvatar(htmlPreview);
  enablePreviewAvatar(fullPreview);
  codeInput.addEventListener("input", () => trackCodeChange(codeInput.value));
  $("format-code").addEventListener("click", async () => {
    try {
      await codeEditor.format();
    } catch {
      toast("格式化失败，请检查 HTML 标签是否完整。");
    }
  });
  $("discard-code").addEventListener("click", () => {
    codeDrafts.delete(current);
    syncCodeEditor();
    renderCodeControls();
  });
  $("apply-code").addEventListener("click", () => {
    const html = currentCode();
    codeDrafts.delete(current);
    appendDirectEdit(displayedVersion.profile, "编辑 HTML", "已将 HTML 修改应用到预览。", html);
  });
  $("export-site").addEventListener("click", () => exportWebsite(displayedHTML));
  $("download-code").addEventListener("click", () => exportWebsite(currentCode()));
  $("open-publish").addEventListener("click", openPublishDialog);
  $("publish-confirm").addEventListener("click", publishVersion);
  $("copy-published").addEventListener("click", copyPublication);
  publishDialog.addEventListener("close", () => { publication = null; });
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
