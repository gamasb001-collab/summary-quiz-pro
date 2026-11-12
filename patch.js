/* =============================================================================
   patch.js — Penyempurnaan Summary, PPT & Quiz Generator PRO (Arraihan Academy)
   Muat SETELAH script utama di index.html:  <script src="patch.js"></script>
   Isi: ringkasan tanpa kalimat terpotong • PPT detail per topik • ekstraksi PDF
   yang menjaga baris/judul • batas token Gemini diperbesar.
   ============================================================================= */
(function () {
  "use strict";

  // ---------- 1. UTILITAS TEKS UTUH (ANTI-TERPOTONG) ----------
  const STOP = new Set(("yang dan di ke dari untuk pada dengan adalah merupakan yaitu dalam atau oleh juga serta ini itu sebagai karena agar dapat akan bagi para tersebut meliputi berupa selama tanpa guna hingga antara setiap lebih hanya telah sudah bila jika maka hal").split(" "));

  function completeText(s) {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    s = s.replace(/(\.\.\.|…)+$/, "").trim();
    if (!s) return s;
    if (!/[.!?)"”:;]$/.test(s)) s += ".";
    return s;
  }

  function cutAtWord(s, max) {
    s = (s || "").trim();
    if (s.length <= max) return s;
    let c = s.slice(0, max);
    const sp = c.lastIndexOf(" ");
    if (sp > max * 0.5) c = c.slice(0, sp);
    return c.replace(/[\s,;:(\-–]+$/, "").replace(/\s+(dan|yang|di|ke|dari|untuk|pada|dengan|atau)$/i, "");
  }

  function titleCaseIfUpper(s) {
    s = (s || "").trim();
    if (s.length > 28 && s === s.toUpperCase()) {
      return s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    }
    return s;
  }

  function stripHeadingMark(l) {
    return l.replace(/^(#+\s*|\d+(\.\d+)*[.)]\s+|[IVX]+[.)]\s+|bab\s+\w+[\s.:-]*)/i, "").trim() || l;
  }

  function splitSentences(t) {
    const P = "\u0001";
    t = String(t || "").replace(/\b(dr|drs|no|prof|ir|hal|vs|sp|spp|tn|ny|ph|mis)\.(?=\s)/gi, m => m.slice(0, -1) + P);
    return t.split(/(?<=[.!?])\s+/)
      .map(x => completeText(x.replace(new RegExp(P, "g"), ".")))
      .filter(x => x.length >= 12);
  }

  // ---------- 2. PEMETAAN MATERI → TOPIK ----------
  function kwSet(s) {
    return new Set((s.toLowerCase().match(/[a-zà-ÿ]{5,}/g) || []).filter(w => !STOP.has(w)));
  }

  function deriveTitle(first) {
    const m = first.match(/^(.{4,70}?)\s+(?:adalah|merupakan|yaitu|meliputi|terdiri|bertujuan|diberikan|dilakukan|menggunakan|digunakan|ditularkan|disebabkan|dikenal|dilaksanakan)\b/i);
    let t = m ? m[1] : first.split(/\s+/).slice(0, 7).join(" ");
    t = t.replace(/^(pada|dalam|untuk|bagi|dengan)\s+/i, "").replace(/[,:;(.]+$/, "").trim();
    t = cutAtWord(t, 60);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function clusterSentences(sents) {
    const groups = [];
    sents.forEach(s => {
      const kw = kwSet(s);
      let best = -1, bestScore = 0;
      groups.forEach((g, gi) => {
        if (g.items.length >= 4) return;
        let inter = 0;
        kw.forEach(w => { if (g.kw.has(w)) inter++; });
        let score = inter / Math.max(1, Math.min(kw.size, g.kw.size));
        if (gi === groups.length - 1) score += 0.12;
        if (score > bestScore) { bestScore = score; best = gi; }
      });
      if (best >= 0 && bestScore >= 0.2) {
        groups[best].items.push(s);
        kw.forEach(w => groups[best].kw.add(w));
      } else {
        groups.push({ items: [s], kw });
      }
    });
    const out = [];
    groups.forEach(g => {
      const last = out[out.length - 1];
      if (g.items.length === 1 && last && last.items.length < 3) last.items.push(g.items[0]);
      else out.push({ items: g.items.slice() });
    });
    const used = {};
    return out.map(g => {
      let t = deriveTitle(g.items[0]);
      used[t] = (used[t] || 0) + 1;
      if (used[t] > 1) t += " (" + used[t] + ")";
      return { title: t, items: g.items };
    });
  }

  function parseTopics(raw) {
    const text = (raw || "").replace(/\r/g, "");
    let docTitle = "", topics = [];

    // Mode file PPTX: satu slide sumber = satu topik
    if (/\[SLIDE \d+\]/i.test(text)) {
      const blocks = text.split(/\[SLIDE \d+\]\s*/i).map(b => b.trim()).filter(Boolean);
      blocks.forEach((b, i) => {
        const ls = b.split("\n").map(l => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
        if (!ls.length) return;
        if (i === 0 && blocks.length > 1) {
          docTitle = ls[0];
          const rest = ls.slice(1);
          if (rest.join(" ").length > 60) topics.push({ title: "Pengantar", items: rest.map(completeText) });
          return;
        }
        if (ls.length > 1) topics.push({ title: titleCaseIfUpper(stripHeadingMark(ls[0])), items: ls.slice(1).map(completeText) });
      });
      return { docTitle, topics: topics.filter(t => t.items.length) };
    }

    // Gabungkan baris yang terpotong (hasil ekstraksi PDF)
    const lines = [];
    text.split("\n").map(l => l.trim()).filter(Boolean).forEach(l => {
      const prev = lines[lines.length - 1];
      if (prev !== undefined && !/[.!?:;]$/.test(prev) && /^[a-z]/.test(l) && prev.length > 40) lines[lines.length - 1] = prev + " " + l;
      else lines.push(l);
    });

    const isHeading = (l, next) => {
      if (l.length > 100 || /[.!?;,]$/.test(l) || /^[-*•]\s/.test(l)) return false;
      if (/^(\d+(\.\d+)*[.)]\s+\S|\d+\.\d+\s+\S|[IVX]+[.)]\s+\S|bab\s+\w+|#+\s*\S)/i.test(l)) return true;
      if (/[A-Z]/.test(l) && l === l.toUpperCase()) return true;
      const words = l.split(/\s+/).length;
      return words <= 10 && !!next && next.length > l.length + 15 && !/^[a-z]/.test(l);
    };

    let cur = null;
    lines.forEach((l, i) => {
      if (isHeading(l, lines[i + 1])) {
        if (i === 0 && !docTitle) { docTitle = l; return; }
        cur = { title: titleCaseIfUpper(stripHeadingMark(l)), items: [] };
        topics.push(cur);
        return;
      }
      if (!cur) { cur = { title: "Pendahuluan", items: [], implicit: true }; topics.push(cur); }
      splitSentences(l.replace(/^[-*•]\s*/, "")).forEach(s => cur.items.push(s));
    });
    topics = topics.filter(t => t.items.length);

    // Tanpa struktur judul → kelompokkan kalimat per kesamaan topik (urutan disusun ulang)
    if (topics.filter(t => !t.implicit).length < 2) {
      const seen = new Set(), sents = [];
      topics.forEach(t => t.items.forEach(s => {
        const k = s.toLowerCase().slice(0, 40);
        if (!seen.has(k)) { seen.add(k); sents.push(s); }
      }));
      topics = sents.length ? clusterSentences(sents) : [];
    }
    return { docTitle, topics };
  }

  // ---------- 3. SLIDE: PEMECAHAN OTOMATIS & PENYUSUN PER TOPIK ----------
  function normalizeSlides(slides) {
    const out = [];
    (slides || []).forEach(s => {
      const lay = s.layout || "bullets";
      const raw = (s.bullets || []).filter(x => String(x || "").trim());
      const b = raw.map(x => lay === "agenda" ? String(x).trim() : completeText(x));
      if (lay === "cover" || b.length <= 1) { out.push(Object.assign({}, s, { bullets: b })); return; }
      const maxN = lay === "agenda" ? 8 : 4, maxC = 720;
      let chunk = [], len = 0, part = 0;
      const flush = () => {
        if (!chunk.length) return;
        const suffix = part === 0 ? "" : (part === 1 ? " (lanjutan)" : " (lanjutan " + part + ")");
        out.push(Object.assign({}, s, { title: (s.title || "") + suffix, bullets: chunk }));
        chunk = []; len = 0; part++;
      };
      b.forEach(x => {
        if (chunk.length && (chunk.length >= maxN || len + x.length > maxC)) flush();
        chunk.push(x); len += x.length;
      });
      flush();
    });
    out.forEach((s, i) => { s.slideNumber = i + 1; });
    return out;
  }

  function buildTopicSlides(topics, title, overview, keyPoints, keyTerms) {
    const s = [];
    topics = (topics || []).filter(t => t.items && t.items.length);
    s.push({ layout: "cover", title, subtitle: "Ringkasan Materi & Poin Strategis Pembelajaran", bullets: ["Disusun otomatis oleh Summary, PPT & Quiz Generator Pro — Arraihan Academy (SWK)"] });
    if (topics.length > 1) s.push({ layout: "agenda", title: "Agenda Pembahasan", subtitle: "Topik yang Dibahas", bullets: topics.map((t, i) => (i + 1) + ". " + t.title) });
    if (overview) s.push({ layout: "bullets", title: "Gambaran Umum (Intisari Materi)", subtitle: "Ringkasan Eksekutif", bullets: splitSentences(overview) });
    topics.forEach((t, i) => s.push({ layout: "bullets", title: t.title, subtitle: "Topik " + (i + 1) + " dari " + topics.length, bullets: t.items }));
    if (keyTerms && keyTerms.length) s.push({ layout: "terms", title: "Definisi & Istilah Kunci", subtitle: "Glosarium Materi", bullets: keyTerms.map(t => t.term + ": " + t.definition) });
    const closing = (keyPoints || []).slice(0, 3);
    closing.push("Lanjutkan dengan mengerjakan 10 soal kuis evaluasi untuk menguji penguasaan materi.");
    s.push({ layout: "closing", title: "Kesimpulan & Poin Kunci", subtitle: "Penutup Materi", bullets: closing });
    return normalizeSlides(s);
  }

  function sanitizeData(d) {
    if (!d) return d;
    d.overview = completeText(d.overview);
    d.keyPoints = (d.keyPoints || []).map(completeText);
    d.keyTerms = (d.keyTerms || []).map(t => ({ term: String(t.term || "").trim(), definition: completeText(t.definition) }));
    (d.questions || []).forEach(q => {
      q.explanation = completeText(q.explanation);
      if (q.type === "essay") q.correctAnswer = completeText(q.correctAnswer);
    });
    return d;
  }

  window.parseTopics = parseTopics; window.buildTopicSlides = buildTopicSlides; window.normalizeSlides = normalizeSlides;

  // ---------- 4. MESIN LOKAL (KALIMAT UTUH, SLIDE PER TOPIK) ----------
  window.buildLocalSmartAnalysis = function (rawText, qType) {
    const parsed = parseTopics(rawText);
    const topics = parsed.topics;
    const seen = new Set(), allItems = [];
    topics.forEach(t => t.items.forEach(s => {
      const k = s.toLowerCase().slice(0, 40);
      if (!seen.has(k)) { seen.add(k); allItems.push(s); }
    }));
    const firstLine = (rawText.split("\n").map(l => l.trim()).filter(Boolean)[0] || "").replace(/^\[SLIDE \d+\]\s*/i, "");
    const title = cutAtWord(parsed.docTitle || (topics[0] && topics[0].title) || firstLine || "Ringkasan Materi & Evaluasi", 110);

    const uniq = allItems.filter(s => s.length >= 30);
    if (uniq.length < 6) {
      uniq.push(
        "Materi " + title + " membahas konsep dasar, prinsip pelaksanaan, serta prosedur standar yang wajib dipahami secara sistematis.",
        "Penerapan pedoman pada " + title + " bertujuan meningkatkan kualitas hasil, ketepatan analisis, serta efektivitas evaluasi di lapangan.",
        "Identifikasi indikator kunci dalam " + title + " menjadi landasan pengambilan keputusan yang akurat dan terukur.",
        "Pengendalian faktor risiko serta kepatuhan terhadap standar operasional sangat menentukan keberhasilan implementasi materi ini.",
        "Evaluasi berkala dan pemantauan indikator capaian diperlukan untuk memastikan kesinambungan mutu pembelajaran dan layanan.",
        "Sinergi antar komponen pelaksana mendukung tercapainya target utama sesuai regulasi dan pedoman teknis yang berlaku."
      );
    }

    const scored = uniq.map((s, idx) => {
      let score = 0;
      if (idx < 4) score += 3;
      if (/\b(adalah|merupakan|yaitu|bertujuan|meliputi|fungsi|utama|standar|pengobatan|diagnosis|langkah|prinsip|faktor|indikator|wajib)\b/i.test(s)) score += 5;
      if (/\d+/.test(s)) score += 2;
      return { text: s, score, idx };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 8).sort((a, b) => a.idx - b.idx).map(x => x.text);
    const overview = top.slice(0, 3).join(" ");
    const keyPoints = top.slice();

    const keyTerms = [];
    const defA = /^([A-Za-z0-9\s()/&,-]{3,70}?)\s+(?:adalah|merupakan|yaitu|dikenal sebagai|disebut|didefinisikan sebagai)\s+(.{20,500})/i;
    const defB = /^([^:.]{3,50}):\s+(.{20,500})/;
    for (const s of uniq) {
      const m = s.match(defA) || s.match(defB);
      const term = m ? m[1].trim() : "";
      const dup = keyTerms.some(k => k.term.toLowerCase() === term.toLowerCase());
      if (m && !dup && term.split(/\s+/).length <= 8 && keyTerms.length < 8) keyTerms.push({ term, definition: completeText(m[2]) });
    }
    for (let i = 0; keyTerms.length < 4 && i < topics.length; i++) {
      if (!keyTerms.some(k => k.term.toLowerCase() === topics[i].title.toLowerCase())) keyTerms.push({ term: topics[i].title, definition: topics[i].items[0] });
    }
    while (keyTerms.length < 4) {
      keyTerms.push({ term: "Konsep Utama Materi", definition: keyPoints[keyTerms.length] || overview });
    }

    const slides = buildTopicSlides(topics, title, overview, keyPoints, keyTerms);

    const distractors = [
      "Mengabaikan verifikasi standar awal dan langsung melakukan tindakan tanpa prosedur pemeriksaan.",
      "Mengandalkan asumsi subjektif tanpa didukung data maupun indikator yang terukur.",
      "Menunda tahapan evaluasi hingga seluruh proses berakhir tanpa pemantauan berkala.",
      "Mengganti prosedur baku dengan metode alternatif yang belum teruji validitasnya."
    ];
    const stems = [
      'Berdasarkan materi "' + title + '", pernyataan manakah yang paling tepat menggambarkan konsep utama berikut?',
      'Dalam konteks pembahasan "' + title + '", apa prinsip penting yang harus diperhatikan terkait aspek berikut?',
      "Manakah analisis yang akurat sesuai isi materi mengenai ketentuan berikut?",
      'Apa kesimpulan yang tepat berdasarkan fakta materi pada pembahasan "' + title + '"?',
      "Mengacu pada materi yang dipelajari, langkah atau fakta manakah yang sesuai dengan standar?"
    ];
    const letters = ["A", "B", "C", "D"];
    const questions = [];
    for (let i = 0; i < 10; i++) {
      const fact = uniq[i % uniq.length];
      const correctIdx = i % 4;
      if (qType === "campuran" && i >= 7) {
        questions.push({
          number: i + 1, type: "essay", cognitiveLevel: "Analisis & Aplikasi (HOTS)",
          question: 'Jelaskan secara ringkas bagaimana penerapan konsep berikut dalam "' + title + '" serta dampaknya: "' + fact + '"',
          options: [], correctAnswer: fact,
          explanation: "Sesuai uraian materi, poin kunci yang wajib dijelaskan mencakup: " + fact
        });
      } else {
        const opts = []; let d = 0;
        for (let o = 0; o < 4; o++) {
          if (o === correctIdx) opts.push(letters[o] + ". " + fact);
          else { opts.push(letters[o] + ". " + distractors[(i + d) % distractors.length]); d++; }
        }
        questions.push({
          number: i + 1, type: "pg",
          cognitiveLevel: i < 4 ? "Pemahaman Konsep" : (i < 7 ? "Aplikasi Materi" : "Analisis Kritis (HOTS)"),
          question: stems[i % stems.length], options: opts, correctAnswer: letters[correctIdx],
          explanation: "Jawaban " + letters[correctIdx] + ' benar karena sesuai secara langsung dengan fakta inti dalam materi: "' + fact + '"'
        });
      }
    }
    return { title, overview, keyPoints, keyTerms, slides, questions, engineSource: "Mesin NLP Lokal Instan (Bebas Kuota API)" };
  };

  // ---------- 5. TIPOGRAFI & PRATINJAU SLIDE ----------
  window.computeAdaptiveTypography = function (slide) {
    const titleLen = (slide.title || "").length;
    const total = (slide.bullets || []).join(" ").length;
    let titleClass = "text-lg sm:text-2xl", pptxTitlePt = 23;
    if (titleLen > 80) { titleClass = "text-sm sm:text-lg"; pptxTitlePt = 16; }
    else if (titleLen > 55) { titleClass = "text-base sm:text-xl"; pptxTitlePt = 19; }
    else if (titleLen < 30) { titleClass = "text-xl sm:text-3xl"; pptxTitlePt = 26; }
    let bodyClass = "text-xs sm:text-base", spacingClass = "space-y-2.5";
    if (total > 480) { bodyClass = "text-[10px] sm:text-[11px] leading-snug"; spacingClass = "space-y-1.5"; }
    else if (total > 340) { bodyClass = "text-[11px] sm:text-xs leading-snug"; spacingClass = "space-y-2"; }
    else if (total > 200) { bodyClass = "text-xs sm:text-sm leading-relaxed"; spacingClass = "space-y-2"; }
    return { titleClass, bodyClass, spacingClass, pptxTitlePt, pptxBodyPt: 12 };
  };

  const _origBuildSlides = window.buildSlidesFromData;
  window.buildSlidesFromData = function (data) { return normalizeSlides(_origBuildSlides(data)); };

  window.renderSlideDeck = function () {
    if (!currentData) return;
    currentSlides = window.buildSlidesFromData(currentData);
    if (activeSlideIndex >= currentSlides.length) activeSlideIndex = 0;
    const themeKey = document.getElementById("pptThemeSelect").value || "indigo";
    const theme = PPT_THEMES[themeKey] || PPT_THEMES.indigo;
    const slide = currentSlides[activeSlideIndex];
    const typo = computeAdaptiveTypography(slide);
    const canvas = document.getElementById("slideCanvas");
    document.getElementById("slideCounterText").textContent = (activeSlideIndex + 1) + " / " + currentSlides.length;
    const num = String(activeSlideIndex + 1).padStart(2, "0");

    if (slide.layout === "cover" || activeSlideIndex === 0) {
      canvas.className = "slide-aspect p-6 sm:p-10 flex flex-col justify-between " + theme.bgCover;
      canvas.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-[10px] sm:text-[11px] uppercase tracking-widest font-bold px-3 py-1 rounded-full bg-white/15">Arraihan Academy (SWK) &bull; Executive Deck</span>
          <span class="text-xs font-mono opacity-75">Slide ${num}</span>
        </div>
        <div class="my-auto space-y-3 max-w-2xl">
          <div class="w-16 h-1.5 rounded-full bg-amber-400"></div>
          <h2 class="${typo.titleClass} font-extrabold leading-tight tracking-tight">${slide.title}</h2>
          <p class="text-xs sm:text-base opacity-85 font-medium">${slide.subtitle || "Ringkasan Materi & Poin Kunci"}</p>
        </div>
        <div class="flex items-center justify-between text-[10px] sm:text-[11px] opacity-75 border-t border-white/15 pt-3">
          <span>Summary, PPT & Quiz Generator PRO</span>
          <span>${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</span>
        </div>`;
    } else {
      canvas.className = "slide-aspect p-5 sm:p-8 flex flex-col justify-between " + theme.bgContent;
      const bullets = slide.bullets || [];
      const isTerms = slide.layout === "terms";
      const contentHtml = isTerms && bullets.length > 1
        ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-auto">${bullets.map(b => {
            const ci = b.indexOf(":");
            const head = ci > 0 ? b.slice(0, ci) : "Konsep";
            const desc = ci > 0 ? b.slice(ci + 1).trim() : b;
            return `<div class="p-3 rounded-xl ${theme.cardBg}"><div class="font-extrabold text-xs uppercase tracking-wide ${theme.bulletIcon} mb-1">${head}</div><div class="text-xs leading-snug opacity-90">${desc}</div></div>`;
          }).join("")}</div>`
        : `<div class="${typo.spacingClass} my-auto">${bullets.map(b => `
            <div class="p-2.5 sm:p-3 rounded-xl ${theme.cardBg} flex items-start gap-2.5">
              <i class="fa-solid fa-circle-check ${theme.bulletIcon} mt-0.5 shrink-0"></i>
              <p class="${typo.bodyClass} font-medium">${b}</p>
            </div>`).join("")}</div>`;
      canvas.innerHTML = `
        <div class="border-b border-slate-300/50 pb-2 flex items-start justify-between gap-2">
          <div>
            <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${theme.badge}">${slide.subtitle || "Poin Materi"}</span>
            <h3 class="${typo.titleClass} font-extrabold mt-1 leading-snug">${slide.title}</h3>
          </div>
          <span class="text-xs font-extrabold opacity-40 font-mono">${num}</span>
        </div>
        ${contentHtml}
        <div class="flex items-center justify-between gap-3 text-[10px] opacity-60 pt-2 border-t border-slate-300/40">
          <span class="max-w-[70%] leading-tight">${currentData.title || "Ringkasan Materi"}</span>
          <span class="shrink-0">Arraihan Academy (SWK)</span>
        </div>`;
    }

    document.getElementById("slideThumbnails").innerHTML = currentSlides.map((s, idx) => `
      <button type="button" onclick="goToSlide(${idx})" class="p-2 rounded-lg border text-left transition cursor-pointer ${idx === activeSlideIndex ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/80 ring-2 ring-indigo-500/20" : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100"}">
        <div class="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400">Slide ${idx + 1}</div>
        <div class="text-[10px] text-slate-700 dark:text-slate-300 font-semibold truncate">${s.title}</div>
      </button>`).join("");
  };

  // ---------- 6. EKSPOR .PPTX (TINGGI KARTU & FONT MENYESUAIKAN ISI) ----------
  function estLines(t, pt, wIn) {
    const cpl = Math.max(12, Math.floor((wIn * 72) / (pt * 0.54)));
    return Math.max(1, Math.ceil(String(t).length / cpl));
  }

  function fitBullets(bullets, wIn, availH, gap) {
    const n = Math.max(bullets.length, 1);
    const calc = pt => {
      const lh = pt * 1.22 / 72;
      return bullets.map(b => estLines(b, pt, wIn - 0.3) * lh + 0.26);
    };
    let pt = 16, hs = calc(pt), total;
    for (; pt >= 9; pt -= 0.5) {
      hs = calc(pt);
      total = hs.reduce((a, b) => a + b, 0) + gap * (n - 1);
      if (total <= availH) break;
    }
    total = hs.reduce((a, b) => a + b, 0) + gap * (n - 1);
    if (total > availH) {
      const f = (availH - gap * (n - 1)) / hs.reduce((a, b) => a + b, 0);
      hs = hs.map(h => h * f);
    } else {
      const extra = Math.min(0.3, (availH - total) / n);
      hs = hs.map(h => h + extra);
    }
    return { pt: Math.max(pt, 9), heights: hs };
  }

  window.exportToPPTX = function () {
    if (!currentData) return;
    if (typeof PptxGenJS === "undefined") { alert("Library PptxGenJS sedang dimuat, silakan coba beberapa detik lagi."); return; }
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_16x9";
    pptx.author = "Arraihan Academy (SWK)";
    pptx.company = "Arraihan Academy";
    pptx.title = currentData.title || "Ringkasan Materi";
    const themeKey = document.getElementById("pptThemeSelect").value || "indigo";
    const theme = PPT_THEMES[themeKey] || PPT_THEMES.indigo;
    const slidesData = window.buildSlidesFromData(currentData);

    slidesData.forEach((s, idx) => {
      const slide = pptx.addSlide();
      const typo = computeAdaptiveTypography(s);
      if (idx === 0 || s.layout === "cover") {
        slide.background = { color: theme.pptxBgCover };
        slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 1.4, h: 0.1, fill: { color: "F59E0B" } });
        slide.addText(s.title || "Ringkasan Materi", { x: 0.7, y: 1.4, w: 8.6, h: 2.1, fontSize: Math.min(typo.pptxTitlePt + 4, 30), bold: true, color: "FFFFFF", fontFace: "Arial", valign: "middle", fit: "shrink" });
        slide.addText(s.subtitle || "Ringkasan Eksekutif & Evaluasi Pembelajaran", { x: 0.7, y: 3.6, w: 8.6, h: 0.7, fontSize: 15, color: "E2E8F0", fontFace: "Arial" });
        slide.addText("Licensed by Arraihan Academy (SWK)  |  Summary, PPT & Quiz Generator PRO", { x: 0.7, y: 4.9, w: 8.6, h: 0.4, fontSize: 10, color: "94A3B8", fontFace: "Arial" });
        return;
      }
      slide.background = { color: theme.pptxBgSlide };
      slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 0.4, w: 0.12, h: 0.85, fill: { color: theme.pptxAccent } });
      slide.addText((s.subtitle || "POIN UTAMA MATERI").toUpperCase(), { x: 0.75, y: 0.38, w: 7.8, h: 0.3, fontSize: 10, bold: true, color: theme.pptxAccent, fontFace: "Arial" });
      slide.addText(s.title || "Slide " + (idx + 1), { x: 0.75, y: 0.65, w: 8.5, h: 0.65, fontSize: typo.pptxTitlePt, bold: true, color: theme.pptxTextMain, fontFace: "Arial", valign: "middle", fit: "shrink" });

      const bullets = s.bullets || [];
      const gap = 0.12;
      const fit = fitBullets(bullets, 8.25, 3.55, gap);
      let y = 1.45;
      bullets.forEach((bText, bi) => {
        const h = fit.heights[bi];
        slide.addShape(pptx.ShapeType.roundRect, { x: 0.6, y, w: 8.8, h, rectRadius: 0.08, fill: { color: themeKey === "dark" ? "1E293B" : "FFFFFF" }, line: { color: themeKey === "dark" ? "334155" : "CBD5E1", width: 1 } });
        slide.addShape(pptx.ShapeType.ellipse, { x: 0.75, y: y + h / 2 - 0.06, w: 0.12, h: 0.12, fill: { color: theme.pptxAccent }, line: { color: theme.pptxAccent, width: 0 } });
        let content = bText;
        const ci = bText.indexOf(":");
        if (s.layout === "terms" && ci > 0 && ci < 60) {
          content = [
            { text: bText.slice(0, ci + 1) + " ", options: { bold: true, color: theme.pptxAccent } },
            { text: bText.slice(ci + 1).trim(), options: { color: theme.pptxTextMain } }
          ];
        }
        slide.addText(content, { x: 1.0, y: y + 0.04, w: 8.25, h: h - 0.08, fontSize: fit.pt, color: theme.pptxTextMain, fontFace: "Arial", valign: "middle", fit: "shrink" });
        y += h + gap;
      });

      slide.addText(cutAtWord(currentData.title || "Materi", 70) + " — Arraihan Academy (SWK)", { x: 0.6, y: 5.15, w: 7.0, h: 0.3, fontSize: 9, color: theme.pptxTextMuted, fontFace: "Arial" });
      slide.addText("Slide " + (idx + 1) + " / " + slidesData.length, { x: 7.8, y: 5.15, w: 1.6, h: 0.3, fontSize: 9, align: "right", bold: true, color: theme.pptxTextMuted, fontFace: "Arial" });
    });

    pptx.writeFile({ fileName: sanitizeFilename(currentData.title) + "_SlidePPT_Arraihan.pptx" });
  };

  // ---------- 7. EKSTRAKSI FILE (PDF MENJAGA BARIS & JUDUL) ----------
  window.handleFileUpload = async function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    const label = document.getElementById("fileNameLabel");
    label.textContent = "Mengekstrak isi file " + file.name + "...";
    try {
      let out = "";
      if (ext === "pptx") {
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        const files = [];
        zip.forEach((p, e) => { const m = p.match(/^ppt\/slides\/slide(\d+)\.xml$/i); if (m) files.push({ num: +m[1], entry: e }); });
        files.sort((a, b) => a.num - b.num);
        const parser = new DOMParser();
        for (const f of files) {
          const doc = parser.parseFromString(await f.entry.async("string"), "application/xml");
          const ps = doc.getElementsByTagName("a:p"), lines = [];
          for (let p = 0; p < ps.length; p++) {
            const ts = ps[p].getElementsByTagName("a:t");
            let line = "";
            for (let t = 0; t < ts.length; t++) line += ts[t].textContent;
            if (line.trim()) lines.push(line.trim());
          }
          if (lines.length) out += "[SLIDE " + f.num + "] " + lines[0] + "\n" + lines.slice(1).map(l => "- " + l).join("\n") + "\n\n";
        }
      } else if (ext === "docx") {
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        const df = zip.file("word/document.xml");
        if (df) {
          const doc = new DOMParser().parseFromString(await df.async("string"), "application/xml");
          const ps = doc.getElementsByTagName("w:p"), lines = [];
          for (let p = 0; p < ps.length; p++) {
            const ts = ps[p].getElementsByTagName("w:t");
            let line = "";
            for (let t = 0; t < ts.length; t++) line += ts[t].textContent;
            if (line.trim()) lines.push(line.trim());
          }
          out = lines.join("\n\n");
        }
      } else if (ext === "pdf") {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const content = await (await pdf.getPage(i)).getTextContent();
          let lastY = null, line = "", page = "";
          content.items.forEach(it => {
            const y = it.transform ? it.transform[5] : 0;
            if (lastY !== null && Math.abs(y - lastY) > 2) { page += line.trim() + "\n"; line = ""; }
            line += it.str + (it.hasEOL ? "\n" : " ");
            lastY = y;
          });
          out += page + line.trim() + "\n\n";
        }
      } else {
        out = await file.text();
      }
      const cleaned = cleanAndCompressText(out);
      if (!cleaned) throw new Error("Tidak ada teks yang dapat diekstrak dari file tersebut.");
      document.getElementById("materialInput").value = cleaned;
      document.getElementById("useWebSearchToggle").checked = false;
      label.innerHTML = '<span class="text-emerald-600 dark:text-emerald-400 font-bold"><i class="fa-solid fa-circle-check mr-1"></i>Berhasil diekstrak: ' + file.name + "</span>";
      updateCharCount();
    } catch (err) {
      alert("Gagal membaca file: " + err.message);
      label.textContent = "Klik untuk memilih file PPTX / PDF / DOCX / Teks";
    }
  };

  // ---------- 8. GEMINI: TOKEN BESAR, PROMPT PER TOPIK, KALIMAT LENGKAP ----------
  window.callGeminiSmart = async function (apiKey, preferredModel, prompt, useWebSearch, hasUrl) {
    const models = [preferredModel, ...VALID_MODELS.filter(m => m !== preferredModel)];
    let lastError = null;
    for (let i = 0; i < models.length; i++) {
      const modelName = models[i];
      document.getElementById("loadingTitle").textContent = "Memproses dengan AI (" + modelName + ")...";
      const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.25, maxOutputTokens: 32768 } };
      if (useWebSearch && i === 0) {
        payload.tools = [{ google_search: {} }];
        if (hasUrl) payload.tools.push({ url_context: {} });
      } else {
        payload.generationConfig.responseMimeType = "application/json";
      }
      try {
        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent?key=" + apiKey, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.error) throw new Error("[" + modelName + "] " + result.error.message);
        if (result.candidates && result.candidates[0] && result.candidates[0].finishReason === "MAX_TOKENS") throw new Error("[" + modelName + "] keluaran terpotong (MAX_TOKENS)");
        return { result, usedModel: modelName };
      } catch (err) { lastError = err; }
    }
    throw lastError;
  };

  window.generateSummaryAndQuiz = async function () {
    if (!checkLicenseStatus()) return;
    const rawText = cleanAndCompressText(document.getElementById("materialInput").value);
    if (!rawText || rawText.length < 4) { alert("Mohon unggah file PPTX/PDF/DOCX, klik 'Muat Contoh', atau ketik materi terlebih dahulu."); return; }
    const difficulty = document.getElementById("difficultySelect").value;
    const qType = document.getElementById("questionTypeSelect").value;
    const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);

    document.getElementById("emptyState").classList.add("hidden");
    document.getElementById("resultContainer").classList.add("hidden");
    document.getElementById("loadingState").classList.remove("hidden");
    document.getElementById("generateBtn").disabled = true;
    const done = () => {
      document.getElementById("loadingState").classList.add("hidden");
      document.getElementById("generateBtn").disabled = false;
    };
    const showLocal = (label) => {
      const d = buildLocalSmartAnalysis(rawText, qType, difficulty);
      if (label) d.engineSource = label;
      currentData = d; renderOutput(d); saveToHistory(d);
    };

    if (engineMode === "local" || !apiKey) {
      setTimeout(() => { try { showLocal(); } finally { done(); } }, 250);
      return;
    }

    const hasUrl = /https?:\/\/[^\s]+/i.test(rawText);
    const useWebSearch = document.getElementById("useWebSearchToggle").checked && (rawText.length < 500 || hasUrl);
    const formatInstruction = qType === "pg"
      ? "Semua 10 pertanyaan WAJIB berbentuk Pilihan Ganda (type: 'pg') dengan 4 opsi (A, B, C, D)."
      : "Pertanyaan nomor 1 sampai 7 berbentuk Pilihan Ganda (type: 'pg') dengan 4 opsi, dan nomor 8 sampai 10 berbentuk Esai/Uraian Terbuka (type: 'essay', options: []).";

    const prompt = `Anda adalah Sistem Pembuat Ringkasan Materi, Slide PPT & 10 Soal Kuis.
Tugas:
1. Analisis materi sumber berikut. Gunakan HANYA isi materi sumber; jangan mengarang fakta.
2. Susun ringkasan eksekutif (overview, 3-5 kalimat), 8 poin penting utama (keyPoints), dan 4-8 istilah kunci beserta definisinya (keyTerms).
3. Susun slide presentasi (slides) PER TOPIK, 10 sampai 18 slide. Kelompokkan isi materi per topik (urutan boleh disusun ulang secara logis), lalu: slide pertama layout "cover"; kedua "agenda" berisi daftar topik; ketiga gambaran umum; kemudian satu atau lebih slide per topik dengan judul topik yang spesifik dan 3-4 poin, setiap poin satu kalimat lengkap berisi fakta, angka, atau istilah dari materi; lalu slide istilah kunci (layout "terms", tiap poin berformat "Istilah: definisi"); terakhir slide kesimpulan (layout "closing").
4. Buat TEPAT 10 pertanyaan kuis (questions) tingkat kesulitan ${difficulty}, berdasarkan isi materi. ${formatInstruction}
ATURAN PENTING: semua kalimat WAJIB lengkap dan diakhiri tanda baca. DILARANG memotong kalimat atau memakai tanda "..." di akhir teks.

Kembalikan HANYA JSON murni sesuai struktur berikut:
{
  "title": "Judul Materi",
  "overview": "Paragraf ringkasan eksekutif",
  "keyPoints": ["Poin 1", "Poin 2"],
  "keyTerms": [{"term": "Istilah 1", "definition": "Penjelasan lengkap"}],
  "slides": [
    {"slideNumber": 1, "layout": "cover", "title": "Judul Slide", "subtitle": "Subjudul", "bullets": ["Poin 1"]}
  ],
  "questions": [
    {"number": 1, "type": "pg", "cognitiveLevel": "Pemahaman", "question": "Pertanyaan...", "options": ["A. Opsi 1", "B. Opsi 2", "C. Opsi 3", "D. Opsi 4"], "correctAnswer": "A", "explanation": "Pembahasan lengkap."}
  ]
}

MATERI SUMBER:
${rawText.slice(0, 45000)}`;

    try {
      const { result, usedModel } = await callGeminiSmart(apiKey, getSafeModel(), prompt, useWebSearch, hasUrl);
      document.getElementById("activeModelPill").textContent = usedModel;
      const cand = result.candidates && result.candidates[0];
      const text = ((cand && cand.content && cand.content.parts) || []).map(p => p.text || "").join("\n");
      const parsed = sanitizeData(extractJsonFromText(text));
      const chunks = (cand && cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
      parsed.webSources = chunks.filter(c => c.web && c.web.uri).map(c => ({ title: c.web.title || c.web.uri, uri: c.web.uri }));
      parsed.engineSource = "Gemini AI (" + usedModel + ")";
      if (!parsed.slides || parsed.slides.length < 6) {
        parsed.slides = buildTopicSlides(parseTopics(rawText).topics, parsed.title || "Ringkasan Materi", parsed.overview, parsed.keyPoints, parsed.keyTerms);
      }
      currentData = parsed; renderOutput(parsed); saveToHistory(parsed);
    } catch (err) {
      console.warn("Beralih otomatis ke Engine Lokal:", err.message);
      showLocal("Auto-Fallback Lokal Instan (Bebas Limit Kuota)");
    } finally { done(); }
  };
})();
