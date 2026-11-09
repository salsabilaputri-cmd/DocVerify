"use strict";

// ==========================================
// PENGATURAN DASAR
// ==========================================

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 12000000;
const HISTORY_KEY = "docverify_history_v4";

const ALLOWED = new Set([
  "pdf", "docx", "txt", "jpg", "jpeg", "png", "webp"
]);

const IMAGE_EXT = new Set([
  "jpg", "jpeg", "png", "webp"
]);

const $ = id => document.getElementById(id);

let currentHash = "";
let selectedHashFile = null;
let ocrWorkerPromise = null;


// ==========================================
// NOTIFIKASI
// ==========================================

function toast(message) {
  const el = $("toast");

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.classList.remove("show");
  }, 3400);
}


// ==========================================
// VALIDASI FILE
// ==========================================

function ext(file) {
  return file.name.split(".").pop().toLowerCase();
}

function validateFile(file) {
  if (!file) {
    throw new Error("Pilih file terlebih dahulu.");
  }

  if (!file.size) {
    throw new Error("File kosong tidak dapat diproses.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Ukuran maksimal file adalah 15 MB.");
  }

  if (!ALLOWED.has(ext(file))) {
    throw new Error(
      "Format tidak didukung. Gunakan PDF, DOCX, TXT, JPG, PNG, atau WEBP."
    );
  }
}


// ==========================================
// PROGRESS BAR
// ==========================================

function setProgress(label, percent) {
  $("compareProgress").hidden = false;

  $("progressLabel").textContent = label;

  $("progressPercent").textContent =
    Math.round(percent) + "%";

  $("progressBar").style.width =
    Math.max(0, Math.min(100, percent)) + "%";
}

function hideProgress() {
  $("compareProgress").hidden = true;
}


// ==========================================
// RIWAYAT PEMERIKSAAN
// ==========================================

function readHistory() {
  try {
    const data = JSON.parse(
      localStorage.getItem(HISTORY_KEY) || "[]"
    );

    return Array.isArray(data)
      ? data.slice(0, 20)
      : [];

  } catch {
    return [];
  }
}

function saveHistory(name, status) {
  try {
    const history = readHistory();

    history.unshift({
      name,
      status,
      date: new Date().toLocaleString("id-ID")
    });

    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(history.slice(0, 20))
    );

    renderHistory();

  } catch {
    toast("Riwayat tidak dapat disimpan pada browser ini.");
  }
}

function renderHistory() {
  const list = $("historyList");

  list.replaceChildren();

  const history = readHistory();

  if (!history.length) {
    const p = document.createElement("p");

    p.className = "empty-state";

    p.textContent =
      "Belum ada riwayat pemeriksaan. Yuk mulai cek dokumen! ♡";

    list.appendChild(p);

    return;
  }

  history.forEach(item => {
    const row = document.createElement("div");

    row.className = "history-item";

    const name = document.createElement("span");

    name.textContent = item.name;

    const detail = document.createElement("span");

    detail.textContent =
      item.status + " · " + item.date;

    row.append(name, detail);

    list.appendChild(row);
  });
}

$("clearHistory").addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);

  renderHistory();

  toast("Riwayat berhasil dihapus.");
});


// ==========================================
// SHA-256 GENERATOR
// ==========================================

async function sha256(file) {
  if (!window.crypto || !crypto.subtle) {
    throw new Error(
      "SHA-256 membutuhkan HTTPS atau localhost."
    );
  }

  const bytes = await file.arrayBuffer();

  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes
  );

  return Array.from(
    new Uint8Array(digest),
    b => b.toString(16).padStart(2, "0")
  ).join("");
}


// ==========================================
// PILIH FILE HASH
// ==========================================

$("fileInput").addEventListener("change", e => {
  const file = e.target.files[0];

  if (!file) {
    selectedHashFile = null;
    $("selectedFile").hidden = true;
    return;
  }

  try {
    validateFile(file);

    selectedHashFile = file;

    $("selectedFile").hidden = false;

    $("selectedFile").textContent =
      file.name + " · " +
      (file.size / 1024).toFixed(1) + " KB";

    $("hashPanel").hidden = true;

    $("verifyResult").hidden = true;

    currentHash = "";

  } catch (err) {
    e.target.value = "";

    selectedHashFile = null;

    toast(err.message);
  }
});


// ==========================================
// TOMBOL GENERATE SHA-256
// ==========================================

$("hashBtn").addEventListener("click", async () => {
  const file = $("fileInput").files[0];

  try {
    validateFile(file);

    $("hashBtn").disabled = true;

    $("hashBtn").textContent = "Menghitung hash...";

    currentHash = await sha256(file);

    $("hashOutput").textContent = currentHash;

    $("hashPanel").hidden = false;

    saveHistory(
      "SHA-256: " + file.name,
      "Hash dibuat"
    );

    toast("Hash SHA-256 berhasil dibuat ♡");

  } catch (err) {
    toast(err.message);

  } finally {
    $("hashBtn").disabled = false;

    $("hashBtn").textContent =
      "✧ Generate SHA-256";
  }
});


// ==========================================
// SALIN HASH
// ==========================================

$("copyHash").addEventListener("click", async () => {
  if (!currentHash) return;

  try {
    if (
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(currentHash);

    } else {
      const range = document.createRange();

      range.selectNodeContents($("hashOutput"));

      const selection = window.getSelection();

      selection.removeAllRanges();

      selection.addRange(range);

      throw new Error(
        "Hash dipilih. Tekan Ctrl+C untuk menyalin."
      );
    }

    toast("Hash berhasil disalin.");

  } catch (err) {
    toast(err.message || "Salin hash secara manual.");
  }
});


// ==========================================
// GUNAKAN HASH SEBAGAI REFERENSI
// ==========================================

$("useHash").addEventListener("click", () => {
  if (!currentHash) return;

  $("referenceHash").value = currentHash;

  $("verify-section").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  toast("Hash dimasukkan sebagai referensi.");
});


// ==========================================
// VERIFIKASI HASH
// ==========================================

$("verifyBtn").addEventListener("click", async () => {
  const ref = $("referenceHash")
    .value
    .trim()
    .toLowerCase();

  const file = $("fileInput").files[0];

  try {
    validateFile(file);

    if (!/^[a-f0-9]{64}$/.test(ref)) {
      throw new Error(
        "Hash referensi harus terdiri dari 64 karakter hexadecimal."
      );
    }

    $("verifyBtn").disabled = true;

    $("verifyBtn").textContent = "Memeriksa...";

    const actual = await sha256(file);

    const same = actual === ref;

    const panel = $("verifyResult");

    panel.hidden = false;

    panel.replaceChildren();

    const h = document.createElement("h3");

    h.className = same
      ? "match"
      : "mismatch";

    h.textContent = same
      ? "✓ HASH COCOK"
      : "⚠ HASH TIDAK COCOK";

    const p = document.createElement("p");

    p.textContent = same
      ? "Byte file sama persis dengan hash referensi."
      : "File berbeda dari hash referensi. File mungkin berubah, atau hash referensinya bukan milik file ini.";

    panel.append(h, p);

    saveHistory(
      "Verifikasi hash: " + file.name,
      same ? "Cocok" : "Tidak cocok"
    );

    toast(
      same
        ? "Hash cocok ♡"
        : "Hash tidak cocok."
    );

  } catch (err) {
    toast(err.message);

  } finally {
    $("verifyBtn").disabled = false;

    $("verifyBtn").textContent =
      "♡ Verifikasi hash";
  }
});


// ==========================================
// EKSTRAKSI TEKS PDF
// ==========================================

async function extractPdfText(file) {
  if (!window.pdfjsLib) {
    throw new Error(
      "Library PDF.js belum termuat. Periksa koneksi internet lalu muat ulang."
    );
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(await file.arrayBuffer())
  }).promise;

  let pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);

    const content = await page.getTextContent();

    pages.push(
      content.items.map(x => x.str).join(" ")
    );
  }

  return {
    text: pages.join("\n"),
    pdf,
    pages: pdf.numPages
  };
}


// ==========================================
// EKSTRAKSI TEKS BERDASARKAN FORMAT
// ==========================================

async function extractText(file) {
  const type = ext(file);

  // TXT
  if (type === "txt") {
    return {
      text: await file.text(),
      source: "teks TXT"
    };
  }

  // DOCX
  if (type === "docx") {
    if (!window.mammoth) {
      throw new Error(
        "Library DOCX belum termuat. Periksa koneksi internet lalu muat ulang."
      );
    }

    const result = await mammoth.extractRawText({
      arrayBuffer: await file.arrayBuffer()
    });

    return {
      text: result.value,
      source: "teks DOCX"
    };
  }

  // PDF
  if (type === "pdf") {
    const result = await extractPdfText(file);

    return {
      text: result.text,
      source: "teks PDF",
      pdf: result.pdf,
      pages: result.pages
    };
  }

  // GAMBAR
  if (IMAGE_EXT.has(type)) {
    return {
      text: "",
      source: "gambar"
    };
  }

  throw new Error("Format teks tidak didukung.");
}


// ==========================================
// OCR - TESSERACT
// ==========================================

async function getOCRWorker() {
  if (!window.Tesseract) {
    throw new Error(
      "Library OCR belum termuat. Periksa koneksi internet lalu muat ulang."
    );
  }

  if (!ocrWorkerPromise) {
    ocrWorkerPromise = Tesseract.createWorker(
      "ind+eng",
      1,
      {
        logger: m => {
          if (m.status === "recognizing text") {
            setProgress(
              "OCR membaca teks...",
              45 + (m.progress || 0) * 40
            );
          }
        }
      }
    );
  }

  return await ocrWorkerPromise;
}

async function ocrImageSource(source) {
  const worker = await getOCRWorker();

  const result = await worker.recognize(source);

  return result.data.text || "";
}


// ==========================================
// RENDER HALAMAN PDF UNTUK OCR
// ==========================================

async function renderPdfPage(pdf, pageNo, scale = 1.35) {
  const page = await pdf.getPage(pageNo);

  const viewport = page.getViewport({
    scale
  });

  const canvas = document.createElement("canvas");

  canvas.width = Math.ceil(viewport.width);

  canvas.height = Math.ceil(viewport.height);

  if (canvas.width * canvas.height > MAX_IMAGE_PIXELS) {
    throw new Error(
      "Halaman PDF terlalu besar untuk OCR."
    );
  }

  await page.render({
    canvasContext: canvas.getContext("2d"),
    viewport
  }).promise;

  return canvas;
}


// ==========================================
// OCR PDF SCAN
// ==========================================

async function ocrPdf(pdf) {
  const parts = [];

  const maxPages = Math.min(pdf.numPages, 20);

  for (let i = 1; i <= maxPages; i++) {
    setProgress(
      "OCR membaca halaman PDF " + i + "/" + maxPages + "...",
      10 + (i / maxPages) * 70
    );

    const canvas = await renderPdfPage(pdf, i);

    parts.push(
      await ocrImageSource(canvas)
    );

    canvas.width = 0;
    canvas.height = 0;
  }

  if (pdf.numPages > maxPages) {
    toast(
      "OCR dibatasi 20 halaman pertama untuk menjaga performa."
    );
  }

  return parts.join("\n");
}


// ==========================================
// MENYIAPKAN TEKS UNTUK PERBANDINGAN
// ==========================================

async function getComparableText(file) {
  const extracted = await extractText(file);

  if (
    extracted.text &&
    extracted.text.trim().length > 10
  ) {
    return {
      text: extracted.text,
      method: extracted.source
    };
  }

  if (!$("enableOCR").checked) {
    throw new Error(
      "Teks tidak ditemukan. Aktifkan OCR untuk PDF scan atau gambar."
    );
  }

  if (
    ext(file) === "pdf" &&
    extracted.pdf
  ) {
    return {
      text: await ocrPdf(extracted.pdf),
      method: "OCR PDF scan"
    };
  }

  if (IMAGE_EXT.has(ext(file))) {
    return {
      text: await ocrImageSource(file),
      method: "OCR gambar"
    };
  }

  throw new Error(
    "Teks tidak ditemukan dan OCR tidak tersedia untuk format ini."
  );
}


// ==========================================
// MEMBANDINGKAN TEKS
// ==========================================

function compareText(a, b) {
  const oldLines = a
    .replace(/\r/g, "")
    .split("\n");

  const newLines = b
    .replace(/\r/g, "")
    .split("\n");

  const diffs = [];

  const max = Math.max(
    oldLines.length,
    newLines.length
  );

  for (let i = 0; i < max; i++) {
    const old = oldLines[i] ?? "";
    const neu = newLines[i] ?? "";

    if (old.trim() !== neu.trim()) {
      diffs.push({
        line: i + 1,
        old,
        new: neu
      });
    }
  }

  return diffs;
}


// ==========================================
// MENAMPILKAN PERBEDAAN TEKS
// ==========================================

function showTextDifferences(diffs) {
  const list = $("differenceList");

  list.replaceChildren();

  diffs.slice(0, 100).forEach(d => {
    const item = document.createElement("div");

    item.className = "difference-item";

    const title = document.createElement("strong");

    title.textContent =
      "Perbedaan baris " + d.line;

    const old = document.createElement("p");

    old.className = "old-line";

    old.textContent =
      "Asli: " + (d.old || "(kosong)");

    const neu = document.createElement("p");

    neu.className = "new-line";

    neu.textContent =
      "Diperiksa: " + (d.new || "(kosong)");

    item.append(title, old, neu);

    list.append(item);
  });

  if (diffs.length > 100) {
    const p = document.createElement("p");

    p.textContent =
      "100 dari " + diffs.length +
      " perbedaan ditampilkan.";

    list.append(p);
  }
}


// ==========================================
// MEMBACA GAMBAR
// ==========================================

async function loadImage(file) {
  if (!window.createImageBitmap) {
    throw new Error(
      "Browser tidak mendukung pembacaan gambar ini."
    );
  }

  const bitmap = await createImageBitmap(file);

  if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
    bitmap.close();

    throw new Error(
      "Resolusi gambar melebihi batas 12 megapiksel."
    );
  }

  return bitmap;
}


// ==========================================
// MEMBANDINGKAN PIXEL GAMBAR
// ==========================================

async function compareImages(f1, f2) {
  const [a, b] = await Promise.all([
    loadImage(f1),
    loadImage(f2)
  ]);

  try {
    const width = Math.max(a.width, b.width);

    const height = Math.max(a.height, b.height);

    if (width * height > MAX_IMAGE_PIXELS) {
      throw new Error(
        "Ukuran gabungan gambar terlalu besar."
      );
    }

    const canvases = [
      document.createElement("canvas"),
      document.createElement("canvas")
    ];

    canvases.forEach(c => {
      c.width = width;
      c.height = height;
    });

    const c1 = canvases[0].getContext(
      "2d",
      { willReadFrequently: true }
    );

    const c2 = canvases[1].getContext(
      "2d",
      { willReadFrequently: true }
    );

    c1.drawImage(a, 0, 0);

    c2.drawImage(b, 0, 0);

    const d1 = c1.getImageData(
      0, 0, width, height
    ).data;

    const d2 = c2.getImageData(
      0, 0, width, height
    ).data;

    let changed = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;

        if (
          d1[i] !== d2[i] ||
          d1[i + 1] !== d2[i + 1] ||
          d1[i + 2] !== d2[i + 2] ||
          d1[i + 3] !== d2[i + 3]
        ) {
          changed++;
        }
      }
    }

    return {
      changed,
      total: width * height,
      dimensionsSame:
        a.width === b.width &&
        a.height === b.height
    };

  } finally {
    a.close();
    b.close();
  }
}


// ==========================================
// MENAMPILKAN HASIL PERBANDINGAN
// ==========================================

function showResult(title, summary, status) {
  $("compareResult").hidden = false;

  $("compareTitle").textContent = title;

  $("compareTitle").className = status;

  $("compareSummary").textContent = summary;
}


// ==========================================
// PREVIEW GAMBAR
// ==========================================

function showImagePreview(fileA, fileB) {
  const holder = document.createElement("div");

  holder.className = "image-summary";

  [fileA, fileB].forEach((f, i) => {
    const wrap = document.createElement("div");

    const img = document.createElement("img");

    const url = URL.createObjectURL(f);

    img.src = url;

    img.alt = i === 0
      ? "Pratinjau dokumen asli"
      : "Pratinjau dokumen diperiksa";

    img.onload = () => {
      URL.revokeObjectURL(url);
    };

    const p = document.createElement("p");

    p.textContent = i === 0
      ? "Dokumen asli"
      : "Dokumen diperiksa";

    wrap.append(img, p);

    holder.append(wrap);
  });

  $("differenceList").append(holder);
}


// ==========================================
// RESET HASIL PERBANDINGAN
// ==========================================

function clearCompareResult() {
  $("differenceList").replaceChildren();

  $("compareResult").hidden = true;
}


// ==========================================
// TOMBOL BANDINGKAN DOKUMEN
// ==========================================

$("compareBtn").addEventListener("click", async () => {

  const original = $("originalFile").files[0];

  const edited = $("editedFile").files[0];

  const button = $("compareBtn");

  try {
    validateFile(original);

    validateFile(edited);

    button.disabled = true;

    button.textContent = "Sedang membandingkan...";

    clearCompareResult();

    setProgress("Menyiapkan dokumen...", 5);

    const aExt = ext(original);

    const bExt = ext(edited);

    const bothImages =
      IMAGE_EXT.has(aExt) &&
      IMAGE_EXT.has(bExt);

    const mixedImage =
      IMAGE_EXT.has(aExt) ||
      IMAGE_EXT.has(bExt);


    // --------------------------------------
    // KASUS 1: KEDUA FILE BERUPA GAMBAR
    // --------------------------------------

    if (bothImages) {

      setProgress(
        "Membandingkan piksel gambar...",
        25
      );

      const result = await compareImages(
        original,
        edited
      );

      const pct = (
        result.changed / result.total * 100
      ).toFixed(2);

      if (result.changed === 0) {

        showResult(
          "✓ Gambar identik secara piksel",
          "Tidak ditemukan perbedaan piksel pada area yang dibandingkan.",
          "match"
        );

      } else {

        showResult(
          "⚠ Ditemukan perbedaan visual",

          result.changed.toLocaleString("id-ID") +
          " dari " +
          result.total.toLocaleString("id-ID") +
          " piksel berbeda (" +
          pct +
          "%). Dimensi asli sama: " +
          (result.dimensionsSame ? "Ya" : "Tidak") +
          ".",

          "mismatch"
        );
      }

      showImagePreview(original, edited);


      // OCR GAMBAR
      if ($("enableOCR").checked) {

        try {
          setProgress(
            "Membaca teks pada gambar dengan OCR...",
            45
          );

          const [ta, tb] = await Promise.all([
            ocrImageSource(original),
            ocrImageSource(edited)
          ]);

          if (ta.trim() || tb.trim()) {

            const diffs = compareText(ta, tb);

            const heading = document.createElement("p");

            heading.textContent =
              "Hasil OCR: " +
              (
                diffs.length
                  ? diffs.length + " baris teks berbeda."
                  : "Teks hasil OCR sama."
              );

            $("differenceList").append(heading);

            if (diffs.length) {
              showTextDifferences(diffs);
            }
          }

        } catch (e) {
          const p = document.createElement("p");

          p.textContent =
            "OCR gambar tidak berhasil: " + e.message;

          $("differenceList").append(p);
        }
      }

    } else {

      // ------------------------------------
      // KASUS 2: PDF, DOCX, TXT, ATAU CAMPURAN
      // ------------------------------------

      setProgress(
        "Mengekstrak teks dokumen...",
        15
      );

      const [ta, tb] = await Promise.all([
        getComparableText(original),
        getComparableText(edited)
      ]);

      if (
        !ta.text.trim() &&
        !tb.text.trim()
      ) {
        throw new Error(
          "Tidak ada teks yang dapat dibaca pada kedua file."
        );
      }

      const diffs = compareText(
        ta.text,
        tb.text
      );

      if (diffs.length === 0) {

        showResult(
          "✓ Teks yang terbaca sama",

          "Tidak ditemukan perbedaan pada teks yang berhasil diekstrak. " +
          "Metode: " +
          ta.method +
          " dan " +
          tb.method +
          ". Ini bukan bukti bahwa seluruh tampilan/metadata file identik.",

          "match"
        );

      } else {

        showResult(
          "⚠ Ditemukan perubahan isi",

          "Ditemukan " +
          diffs.length +
          " baris berbeda. Metode: " +
          ta.method +
          " dan " +
          tb.method +
          ". Maksimal 100 rincian ditampilkan.",

          "mismatch"
        );

        showTextDifferences(diffs);
      }

      if (mixedImage) {
        const p = document.createElement("p");

        p.textContent =
          "Catatan: file gambar dibandingkan melalui OCR teksnya; " +
          "untuk perbandingan piksel, unggah dua file gambar.";

        $("differenceList").append(p);
      }
    }


    // ------------------------------------
    // SIMPAN RIWAYAT
    // ------------------------------------

    saveHistory(
      original.name + " dibandingkan dengan " + edited.name,
      $("compareTitle").textContent
    );

    setProgress("Selesai", 100);

    toast("Pembandingan selesai ♡");

  } catch (err) {

    toast(
      err.message ||
      "Gagal membandingkan dokumen."
    );

  } finally {

    button.disabled = false;

    button.textContent = "♡ Bandingkan dokumen";

    setTimeout(hideProgress, 1300);
  }
});


// ==========================================
// RESET SAAT FILE DIGANTI
// ==========================================

$("originalFile").addEventListener(
  "change",
  clearCompareResult
);

$("editedFile").addEventListener(
  "change",
  clearCompareResult
);


// ==========================================
// TAMPILKAN RIWAYAT SAAT WEB DIBUKA
// ==========================================

renderHistory();