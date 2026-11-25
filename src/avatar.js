"use strict";

const FolioAvatar = (() => {
  const assetId = /^[a-f0-9]{64}$/;
  const allowedFiles = "image/png,image/jpeg,image/webp,image/gif,image/avif";

  function assetURL(id) {
    return typeof id === "string" && assetId.test(id) ? "/api/avatars/" + id : "";
  }

  async function prepare(file) {
    if (!file?.size) throw new Error("请选择一张图片。");
    if (file.size > 15 * 1024 * 1024) throw new Error("原图超出 15 MB，请选择较小的图片。");
    const source = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = source;
      await image.decode();
      const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!png) throw new Error("图片转换失败");
      return png;
    } catch {
      throw new Error("无法读取这张图片，请重新选择 JPG、PNG 或 WebP 图片。");
    } finally {
      URL.revokeObjectURL(source);
    }
  }

  async function upload(file, path) {
    const png = await prepare(file);
    let response;
    try {
      response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: png,
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error("头像上传失败，请检查连接后重试。");
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) throw new Error(result?.message || "头像上传失败，请重试。");
    return result;
  }

  async function embeddedPhoto(id) {
    const response = await fetch(assetURL(id), { cache: "no-store", redirect: "error" });
    if (!response.ok || response.headers.get("content-type") !== "image/png") throw new Error("头像无法读取");
    const png = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result), { once: true });
      reader.addEventListener("error", reject, { once: true });
      reader.readAsDataURL(png);
    });
  }

  const form = document.getElementById("published-avatar-form");
  if (form) {
    const input = document.getElementById("published-avatar-file");
    const button = form.querySelector("button[type=submit]");
    const feedback = document.getElementById("published-avatar-feedback");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (button.disabled) return;
      button.disabled = true;
      input.disabled = true;
      feedback.dataset.error = "false";
      feedback.textContent = "正在保存头像…";
      feedback.hidden = false;
      try {
        await upload(input.files[0], form.dataset.page + "/avatar");
        location.replace(form.dataset.page);
      } catch (error) {
        feedback.dataset.error = "true";
        feedback.textContent = error.message;
        button.disabled = false;
        input.disabled = false;
      }
    });
  }

  return Object.freeze({ allowedFiles, assetURL, upload, embeddedPhoto });
})();
