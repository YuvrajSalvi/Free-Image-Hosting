# imgbb.js

A lightweight, zero-dependency, single-file upload solution for **ImgBB**. It provides a backend API handler alongside a drop-in custom web component (`<imgbb-upload>`) for effortless front-end integration.

---

## 🚀 Features

- **Single-File Setup:** Everything is packed into `imgbb.js`.
- **Drop-in UI Component:** Clean front-end integration via the `<imgbb-upload>` custom element.
- **Simple Configuration:** Environment variable-based configuration (`IMGBB_API_KEY`).
- **Zero Heavy Dependencies:** Easy to maintain and import into existing frameworks or plain Node.js setups.

---

## 📦 Installation & Setup

1. **Copy the file:** Copy `imgbb.js` into your project directory.
2. **Set the API Key:** Set your ImgBB API key as an environment variable.

   ```bash
   export IMGBB_API_KEY="your_imgbb_api_key_here"
   ```

3. **Mount the endpoint:** Mount the handler at `/api/upload` within your application or server router.

---

## 💻 Usage

Add the custom component and script tag directly to your HTML page:

```html
<imgbb-upload></imgbb-upload>
<script src="/api/upload?widget"></script>
```

---

## ⚠️ Testing & Disclaimer

> [!WARNING]  
> **Testing Status:** This project has currently been tested **only against a mocked ImgBB API endpoint** and has **not yet been verified against the live, production ImgBB API**.
>
> Please test thoroughly with a real key in a staging environment before using it in production.

---

## 📄 License

Open Source — feel free to modify, extend, and distribute within your projects.
