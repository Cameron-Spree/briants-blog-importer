// ===================================================
// Blog-to-CSV Compiler — App Logic
// ===================================================

(function () {
  'use strict';

  // --- DOM References ---
  const textarea       = document.getElementById('blog-input');
  const charCount      = document.getElementById('char-count');
  const btnClear       = document.getElementById('btn-clear');
  const btnCompile     = document.getElementById('btn-compile');
  const btnDownload    = document.getElementById('btn-download');
  const statusBar      = document.getElementById('status-bar');
  const statusIcon     = document.getElementById('status-icon');
  const statusText     = document.getElementById('status-text');
  const previewSection = document.getElementById('preview-section');
  const previewTbody   = document.getElementById('preview-tbody');
  const instrToggle    = document.getElementById('instructions-toggle');
  const instrBody      = document.getElementById('instructions-body');

  // --- State ---
  let compiledPosts = [];

  // --- Helpers ---

  /**
   * Generate a URL-safe slug from a title string.
   */
  function slugify(title) {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')   // strip non-word chars (except spaces & hyphens)
      .replace(/[\s_]+/g, '-')    // convert spaces & underscores to hyphens
      .replace(/-+/g, '-')        // collapse repeated hyphens
      .replace(/^-|-$/g, '');     // trim leading/trailing hyphens
  }

  /**
   * Convert raw content lines into HTML with <h2> and <p> wrapping.
   */
  function processContent(lines) {
    const htmlParts = [];
    let paragraphBuffer = [];

    function flushParagraph() {
      if (paragraphBuffer.length > 0) {
        htmlParts.push('<p>' + paragraphBuffer.join(' ') + '</p>');
        paragraphBuffer = [];
      }
    }

    for (const line of lines) {
      const trimmed = line.trim();

      // Empty line → flush current paragraph
      if (trimmed === '') {
        flushParagraph();
        continue;
      }

      // Sub-heading: ## Header
      if (trimmed.startsWith('## ')) {
        flushParagraph();
        const headingText = trimmed.replace(/^##\s*/, '');
        htmlParts.push('<h2>' + escapeHtml(headingText) + '</h2>');
        continue;
      }

      // Regular text — accumulate into paragraph
      paragraphBuffer.push(escapeHtml(trimmed));
    }

    flushParagraph();
    return htmlParts.join('\n');
  }

  /**
   * Escape HTML special characters.
   */
  function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, c => map[c]);
  }

  /**
   * Get today's date in YYYY-MM-DD format.
   */
  function todayDate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Escape a value for CSV (RFC 4180).
   */
  function csvEscape(value) {
    const str = String(value);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // --- Core: Parse input into post objects ---
  function parseInput(raw) {
    // Split on lines that are exactly "###" (with optional surrounding whitespace)
    const blocks = raw.split(/^###$/m);
    const posts = [];

    for (const block of blocks) {
      const lines = block.split('\n');
      const nonEmptyLines = [];
      const lineIndices = [];

      // Collect non-empty lines and remember their positions
      lines.forEach((line, idx) => {
        if (line.trim() !== '') {
          nonEmptyLines.push(line);
          lineIndices.push(idx);
        }
      });

      if (nonEmptyLines.length < 2) continue; // Need at least title + category

      const title = nonEmptyLines[0].trim();
      const category = nonEmptyLines[1].trim();

      // Content = everything after the second non-empty line
      const contentStartIdx = lineIndices[1] + 1;
      const contentLines = lines.slice(contentStartIdx);

      const postContent = processContent(contentLines);
      const postDate = todayDate();
      const postSlug = slugify(title);

      posts.push({
        post_title: title,
        post_content: postContent,
        post_category: category,
        post_status: 'draft',
        post_type: 'post',
        post_date: postDate,
        post_slug: postSlug,
      });
    }

    return posts;
  }

  // --- UI: Show status ---
  function showStatus(message, isError = false) {
    statusBar.hidden = false;
    statusBar.classList.toggle('error', isError);
    statusText.textContent = message;

    // Swap icon
    if (isError) {
      statusIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
      statusIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    }
  }

  // --- UI: Render preview table ---
  function renderPreview(posts) {
    previewTbody.innerHTML = '';

    posts.forEach((post, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${escapeHtml(post.post_title)}</td>
        <td>${escapeHtml(post.post_category)}</td>
        <td><span class="slug">${escapeHtml(post.post_slug)}</span></td>
        <td>${post.post_date}</td>
        <td>${post.post_status}</td>
      `;
      previewTbody.appendChild(tr);
    });

    previewSection.hidden = false;
  }

  // --- Build CSV string ---
  function buildCSV(posts) {
    const headers = [
      'post_title',
      'post_content',
      'post_category',
      'post_status',
      'post_type',
      'post_date',
      'post_slug',
    ];

    const rows = [headers.map(csvEscape).join(',')];

    for (const post of posts) {
      const row = headers.map(h => csvEscape(post[h]));
      rows.push(row.join(','));
    }

    return rows.join('\r\n');
  }

  // --- Download CSV as file ---
  function downloadCSV(csvString) {
    // BOM for UTF-8 so Excel recognises encoding
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `blog-import-${todayDate()}.csv`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // --- Event Listeners ---

  // Character count
  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    charCount.textContent = `${len.toLocaleString()} character${len !== 1 ? 's' : ''}`;

    // Add pulse to compile if there's content
    btnCompile.classList.toggle('pulse', len > 0);
  });

  // Clear
  btnClear.addEventListener('click', () => {
    textarea.value = '';
    charCount.textContent = '0 characters';
    compiledPosts = [];
    btnDownload.disabled = true;
    statusBar.hidden = true;
    previewSection.hidden = true;
    previewTbody.innerHTML = '';
    btnCompile.classList.remove('pulse');
    textarea.focus();
  });

  // Instructions accordion
  instrToggle.addEventListener('click', () => {
    const isOpen = instrToggle.getAttribute('aria-expanded') === 'true';
    instrToggle.setAttribute('aria-expanded', String(!isOpen));
    instrBody.classList.toggle('open', !isOpen);
  });

  // Compile
  btnCompile.addEventListener('click', () => {
    const raw = textarea.value.trim();

    if (!raw) {
      showStatus('Please paste at least one blog post before compiling.', true);
      previewSection.hidden = true;
      btnDownload.disabled = true;
      return;
    }

    compiledPosts = parseInput(raw);

    if (compiledPosts.length === 0) {
      showStatus('No valid posts found. Each post needs at least a title and category.', true);
      previewSection.hidden = true;
      btnDownload.disabled = true;
      return;
    }

    const count = compiledPosts.length;
    showStatus(`${count} Blog${count !== 1 ? 's' : ''} Prepared — Ready to download!`);
    renderPreview(compiledPosts);
    btnDownload.disabled = false;
    btnCompile.classList.remove('pulse');

    // Smooth scroll to preview
    previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // Download
  btnDownload.addEventListener('click', () => {
    if (compiledPosts.length === 0) return;
    const csv = buildCSV(compiledPosts);
    downloadCSV(csv);
  });
})();
