"use strict";

const FolioModel = (() => {
  const dialog = document.getElementById("model-dialog");
  const form = document.getElementById("model-form");
  const feedback = document.getElementById("model-feedback");
  const saveButton = document.getElementById("save-model");
  const testButton = document.getElementById("test-model");
  const fetchModelsButton = document.getElementById("fetch-models");
  const modelSelectWrap = document.getElementById("model-select-wrap");
  const modelSelect = document.getElementById("available-models");
  const openButtons = [...document.querySelectorAll("[data-model-settings]")];
  const { baseUrl, model, apiToken } = form.elements;
  const ipAddress = /^[0-9]+(?:\.[0-9]+){3}$/.test(location.hostname);
  const serverOrigin = location.protocol === "http:" && (location.hostname === "localhost" || ipAddress);
  let settings = null;
  let editable = false;
  let busy = false;
  let dialogRevision = 0;

  class RequestError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  async function request(path, method = "GET", body, timeout = 4000) {
    let response;
    try {
      response = await fetch(path, {
        method,
        cache: "no-store",
        redirect: "error",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      throw new RequestError("local_network", "连接本地服务失败，请确认 npm run dev 正在运行。");
    }
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new RequestError("api_unavailable", "此页面需要通过 Folio 本地服务打开才能配置模型。");
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new RequestError("local_response", "本地服务返回了无法读取的内容。");
    }
    if (!response.ok) {
      throw new RequestError(data.code, data.message || "本地服务请求失败，请重试。");
    }
    return data;
  }

  function setSettings({ baseUrl, model, configured, hasToken }) {
    if (typeof baseUrl !== "string" || typeof model !== "string" || typeof configured !== "boolean" || typeof hasToken !== "boolean") {
      throw new RequestError("api_unavailable", "此页面需要通过 Folio 本地服务打开才能配置模型。");
    }
    settings = { baseUrl, model, configured, hasToken };
    for (const button of openButtons) {
      button.dataset.configured = String(configured);
      button.title = configured ? "模型设置 · " + model : "模型设置 · 当前使用本地整理";
    }
    return settings;
  }

  async function loadSettings() {
    if (!serverOrigin) return null;
    try {
      return setSettings(await request("/api/model-config"));
    } catch (error) {
      if (!settings && ["local_network", "api_unavailable", "not_found"].includes(error.code)) return null;
      throw error;
    }
  }

  async function chat(profile, message, history) {
    const latestContext = history.slice(-8).map((item) => ({
      role: item.role,
      content: item.text.slice(0, 2000),
    }));
    return request("/api/chat", "POST", { profile, message, history: latestContext }, 95000);
  }

  function showFeedback(text, kind = "info") {
    feedback.textContent = text;
    feedback.dataset.kind = kind;
    feedback.hidden = !text;
  }

  function formMatchesSettings(config) {
    return config && baseUrl.value.trim().replace(/\/+$/, "") === config.baseUrl
      && model.value.trim() === config.model && !apiToken.value.trim();
  }

  function paintControls() {
    for (const input of [baseUrl, model, apiToken]) input.disabled = busy || !editable;
    saveButton.disabled = busy || !editable;
    testButton.disabled = busy || !editable || !settings?.configured || !formMatchesSettings(settings);
    fetchModelsButton.disabled = busy || !editable || !baseUrl.value.trim() || !baseUrl.validity.valid;
    modelSelect.disabled = busy || !editable;
  }

  function clearModelList() {
    modelSelectWrap.hidden = true;
    modelSelect.replaceChildren();
  }

  function syncModelSelection() {
    if (modelSelectWrap.hidden) return;
    modelSelect.value = model.value.trim();
    if (modelSelect.selectedIndex === -1) modelSelect.value = "";
  }

  function fillForm(config) {
    if (config) {
      baseUrl.value = config.baseUrl;
      model.value = config.model;
    }
    apiToken.value = "";
    apiToken.placeholder = config?.hasToken ? "已保存，留空可沿用" : "粘贴服务商提供的 Token";
  }

  async function openSettings() {
    dialog.showModal();
    if (busy) return;
    busy = true;
    paintControls();
    showFeedback("正在读取本机配置…");
    try {
      const config = await loadSettings();
      editable = Boolean(config);
      fillForm(config);
      if (!config) showFeedback("请通过 npm run dev 或 npm run preview 启动 Folio，再配置模型。", "error");
      else showFeedback(config.configured ? "已保存模型设置，可以测试连接。" : "未配置模型，当前使用本地整理。");
    } catch (error) {
      editable = error.code === "config_read_error";
      fillForm(settings);
      showFeedback(error.message, "error");
    } finally {
      busy = false;
      paintControls();
      if (dialog.open && editable) baseUrl.focus({ preventScroll: true });
    }
  }

  for (const button of openButtons) button.addEventListener("click", openSettings);
  dialog.addEventListener("close", () => {
    dialogRevision++;
    apiToken.value = "";
    clearModelList();
    showFeedback("");
  });
  form.addEventListener("input", (event) => {
    if (event.target === baseUrl || event.target === apiToken) {
      clearModelList();
      showFeedback("");
    } else if (event.target === model) {
      syncModelSelection();
    }
    paintControls();
  });
  modelSelect.addEventListener("change", () => {
    if (modelSelect.value) model.value = modelSelect.value;
    paintControls();
  });
  fetchModelsButton.addEventListener("click", async () => {
    if (fetchModelsButton.disabled) return;
    const revision = dialogRevision;
    busy = true;
    clearModelList();
    paintControls();
    showFeedback("正在获取模型列表…");
    try {
      const data = await request("/api/models", "POST", { baseUrl: baseUrl.value, apiToken: apiToken.value }, 20000);
      if (revision !== dialogRevision) return;
      if (!data.models.length) {
        showFeedback("服务商返回了空列表，可以手动填写模型 ID。");
        return;
      }
      modelSelect.replaceChildren(
        new Option("从列表选择模型", ""),
        ...data.models.map((id) => new Option(id, id)),
      );
      modelSelectWrap.hidden = false;
      syncModelSelection();
      showFeedback("获取到 " + data.models.length + " 个模型，选择后保存设置。");
    } catch (error) {
      if (revision === dialogRevision) showFeedback(error.message, "error");
    } finally {
      busy = false;
      paintControls();
      if (dialog.open && !modelSelectWrap.hidden) modelSelect.focus({ preventScroll: true });
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editable || busy) return;
    const payload = { baseUrl: baseUrl.value, model: model.value, apiToken: apiToken.value };
    busy = true;
    paintControls();
    showFeedback("正在保存设置…");
    try {
      fillForm(setSettings(await request("/api/model-config", "PUT", payload)));
      showFeedback("已保存。下一条消息将使用这个模型。");
    } catch (error) {
      showFeedback(error.message, "error");
    } finally {
      busy = false;
      paintControls();
    }
  });
  testButton.addEventListener("click", async () => {
    if (testButton.disabled) return;
    busy = true;
    paintControls();
    showFeedback("正在向模型发送测试消息…");
    try {
      await request("/api/model-test", "POST", {}, 95000);
      showFeedback("连接成功，模型已回复测试消息。");
    } catch (error) {
      showFeedback(error.message, "error");
    } finally {
      busy = false;
      paintControls();
    }
  });

  loadSettings().catch(() => { /* The settings dialog displays configuration errors. */ });
  return Object.freeze({ loadSettings, chat, RequestError });
})();
