(() => {
  'use strict';

  /* =========================================================
     Config
     ========================================================= */
  // Shown in the model picker (top-left). First one is the default.
  const MODELS = ['gemini-3.8-flash', 'gemini-pro-latest', 'gemini-flash-lite-latest'];
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const SYSTEM_PROMPT =
    'You are ChatGPT, a helpful, friendly assistant. Format every answer in clean GitHub-flavored Markdown: ' +
    'use short paragraphs, headings (##/###) for longer answers, bullet or numbered lists where they help, ' +
    '**bold** for key terms, tables for comparisons, and fenced code blocks with a language tag for any code. ' +
    'Be concise for simple questions and thorough for complex ones. Do not wrap the whole answer in a code block.';

  /* =========================================================
     Elements & helpers
     ========================================================= */
  const $ = (sel) => document.querySelector(sel);
  const els = {
    root: document.documentElement,
    body: document.body,
    sidebar: $('#sidebar'),
    backdrop: $('#sidebarBackdrop'),
    logoBtn: $('#logoBtn'),
    closeSidebarBtn: $('#closeSidebarBtn'),
    openSidebarBtn: $('#openSidebarBtn'),
    newChatBtn: $('#newChatBtn'),
    headerNewChatBtn: $('#headerNewChatBtn'),
    searchInput: $('#searchInput'),
    history: $('#history'),
    chatList: $('#chatList'),
    historyEmpty: $('#historyEmpty'),
    modelBtn: $('#modelBtn'),
    modelLabel: $('#modelLabel'),
    themeBtn: $('#themeBtn'),
    content: $('#content'),
    thread: $('#thread'),
    messages: $('#messages'),
    composer: $('#composer'),
    input: $('#input'),
    sendBtn: $('#sendBtn'),
    scrollDownBtn: $('#scrollDownBtn'),
    menu: $('#menu'),
    deleteModal: $('#deleteModal'),
    deleteTitle: $('#deleteTitle'),
    cancelDeleteBtn: $('#cancelDeleteBtn'),
    confirmDeleteBtn: $('#confirmDeleteBtn'),
    toast: $('#toast'),
  };

  const ICONS = {
    copy: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="2.2"/><path d="M13 7V5.2A2.2 2.2 0 0 0 10.8 3H5.2A2.2 2.2 0 0 0 3 5.2v5.6A2.2 2.2 0 0 0 5.2 13H7"/></svg>',
    check: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 10.5 3.5 3.5 7.5-8"/></svg>',
    regen: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 10a6 6 0 1 1-1.8-4.3"/><path d="M16 3.5v3.2h-3.2"/></svg>',
    dots: '<svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor"><circle cx="4.5" cy="10" r="1.4"/><circle cx="10" cy="10" r="1.4"/><circle cx="15.5" cy="10" r="1.4"/></svg>',
    pencil: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.6 3.6a1.8 1.8 0 0 1 2.6 2.6L7 15.4l-3.4.9.9-3.4z"/></svg>',
    trash: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.8 10.1A1.5 1.5 0 0 0 7.3 17h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5"/></svg>',
    tick: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 10.5 3.5 3.5 7.5-8"/></svg>',
  };

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
  };

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

  function makeTitle(text) {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length > 40 ? t.slice(0, 40).trimEnd() + '…' : t || 'New chat';
  }

  function prettyModel(id) {
    return id
      .replace(/^models\//, '')
      .split('-')
      .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  let toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2200);
  }

  /* =========================================================
     API key — read from the .env file next to index.html
     ========================================================= */
  let apiKeyPromise = null;

  function getApiKey() {
    if (!apiKeyPromise) {
      apiKeyPromise = fetch('.env', { cache: 'no-store' })
        .then((res) => (res.ok ? res.text() : ''))
        .then((text) => {
          for (const line of text.split(/\r?\n/)) {
            const m = line.match(/^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.*)\s*$/);
            if (m) return m[1].replace(/^(['"])(.*)\1$/, '$2').trim();
          }
          return '';
        })
        .catch(() => '');
    }
    return apiKeyPromise;
  }

  /* =========================================================
     State
     ========================================================= */
  const state = {
    chats: store.get('cg.chats', []),
    activeId: null,
    model: store.get('cg.model', MODELS[0]),
    search: '',
    streaming: false,
    controller: null,
    stick: true,
  };
  if (!MODELS.includes(state.model)) state.model = MODELS[0];

  const save = () => store.set('cg.chats', state.chats);
  const getChat = (id) => state.chats.find((c) => c.id === id);
  const activeChat = () => getChat(state.activeId);

  /* =========================================================
     Markdown rendering
     ========================================================= */
  function setupMarkdown() {
    if (!window.marked) return;
    marked.use({
      gfm: true,
      breaks: false,
      renderer: {
        // marked v12 passes (code, lang); newer versions pass a token object — support both
        code(arg, infostring) {
          const isTok = arg && typeof arg === 'object';
          const text = isTok ? arg.text : arg;
          const lang = ((isTok ? arg.lang : infostring) || '').trim().split(/\s+/)[0].toLowerCase();
          let html = escapeHtml(text);
          if (window.hljs) {
            try {
              html = lang && hljs.getLanguage(lang)
                ? hljs.highlight(text, { language: lang, ignoreIllegals: true }).value
                : hljs.highlightAuto(text).value;
            } catch { /* keep escaped text */ }
          }
          return (
            '<div class="code-block"><div class="code-head">' +
            `<span>${escapeHtml(lang || 'code')}</span>` +
            `<button type="button" class="copy-code">${ICONS.copy}<span>Copy code</span></button>` +
            `</div><pre><code class="hljs">${html}</code></pre></div>`
          );
        },
      },
    });

    if (window.DOMPurify) {
      DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A') {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      });
    }
  }

  function renderMarkdown(el, text) {
    if (window.marked && window.DOMPurify) {
      el.innerHTML = DOMPurify.sanitize(marked.parse(text));
      el.querySelectorAll('table').forEach((t) => {
        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        t.replaceWith(wrap);
        wrap.appendChild(t);
      });
    } else {
      el.style.whiteSpace = 'pre-wrap';
      el.textContent = text;
    }
  }

  /* =========================================================
     Sidebar
     ========================================================= */
  function renderSidebar() {
    const q = state.search.trim().toLowerCase();
    const list = [...state.chats]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((c) => !q || c.title.toLowerCase().includes(q));

    els.chatList.innerHTML = '';
    for (const chat of list) {
      const item = document.createElement('div');
      item.className = 'chat-item' + (chat.id === state.activeId ? ' active' : '');
      item.dataset.id = chat.id;
      item.innerHTML =
        `<span class="chat-title"></span>` +
        `<button class="chat-more" aria-label="Chat options" title="Options">${ICONS.dots}</button>`;
      item.querySelector('.chat-title').textContent = chat.title;
      els.chatList.appendChild(item);
    }

    els.historyEmpty.hidden = list.length > 0;
    els.historyEmpty.textContent = q ? 'No matching chats' : 'No chats yet';
  }

  els.chatList.addEventListener('click', (e) => {
    const item = e.target.closest('.chat-item');
    if (!item || item.querySelector('.rename-input')) return;
    const id = item.dataset.id;

    if (e.target.closest('.chat-more')) {
      e.stopPropagation();
      openChatMenu(id, e.target.closest('.chat-more'));
      return;
    }
    openChat(id);
  });

  function openChatMenu(id, anchor) {
    const item = anchor.closest('.chat-item');
    item.classList.add('menu-open');
    openMenu(anchor, [
      { label: 'Rename', icon: ICONS.pencil, onClick: () => startRename(id) },
      { label: 'Delete', icon: ICONS.trash, danger: true, onClick: () => askDelete(id) },
    ], { onClose: () => item.classList.remove('menu-open') });
  }

  function startRename(id) {
    const chat = getChat(id);
    const item = els.chatList.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!chat || !item) return;

    const titleEl = item.querySelector('.chat-title');
    const input = document.createElement('input');
    input.className = 'rename-input';
    input.value = chat.title;
    titleEl.replaceWith(input);
    item.querySelector('.chat-more').hidden = true;
    input.focus();
    input.select();

    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const val = input.value.trim();
      if (commit && val) {
        chat.title = val;
        save();
        updateDocTitle();
      }
      renderSidebar();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  /* ---------- delete ---------- */
  let pendingDeleteId = null;

  function askDelete(id) {
    const chat = getChat(id);
    if (!chat) return;
    pendingDeleteId = id;
    els.deleteTitle.textContent = chat.title;
    els.deleteModal.hidden = false;
    requestAnimationFrame(() => els.deleteModal.classList.add('open'));
    els.confirmDeleteBtn.focus();
  }

  function closeDeleteModal() {
    pendingDeleteId = null;
    els.deleteModal.classList.remove('open');
    setTimeout(() => { if (!pendingDeleteId) els.deleteModal.hidden = true; }, 150);
  }

  function deleteChat(id) {
    const wasActive = state.activeId === id;
    state.chats = state.chats.filter((c) => c.id !== id);
    save();

    if (wasActive) showNewChatView();

    const item = els.chatList.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (item) {
      item.classList.add('removing');
      setTimeout(renderSidebar, 230);
    } else {
      renderSidebar();
    }
    toast('Chat deleted');
  }

  els.cancelDeleteBtn.addEventListener('click', closeDeleteModal);
  els.confirmDeleteBtn.addEventListener('click', () => {
    const id = pendingDeleteId;
    closeDeleteModal();
    if (id) deleteChat(id);
  });
  els.deleteModal.addEventListener('mousedown', (e) => {
    if (e.target === els.deleteModal) closeDeleteModal();
  });

  /* ---------- search ---------- */
  els.searchInput.addEventListener('input', () => {
    state.search = els.searchInput.value;
    renderSidebar();
  });

  /* ---------- open / collapse ---------- */
  function toggleSidebar(open) {
    if (isMobile()) {
      els.body.classList.toggle('sidebar-open', open);
    } else {
      els.body.classList.toggle('sidebar-collapsed', !open);
      store.set('cg.sidebarCollapsed', !open);
    }
  }
  const closeMobileSidebar = () => els.body.classList.remove('sidebar-open');

  els.closeSidebarBtn.addEventListener('click', () => toggleSidebar(false));
  els.openSidebarBtn.addEventListener('click', () => toggleSidebar(true));
  els.backdrop.addEventListener('click', closeMobileSidebar);

  /* =========================================================
     Floating menu (shared by chat options + model picker)
     ========================================================= */
  let menuOnClose = null;

  function openMenu(anchor, items, { onClose, label } = {}) {
    closeMenu();
    menuOnClose = onClose || null;

    const m = els.menu;
    m.innerHTML = label ? `<div class="menu-label">${escapeHtml(label)}</div>` : '';
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'menu-item' + (it.danger ? ' danger' : '');
      b.setAttribute('role', 'menuitem');
      b.innerHTML =
        (it.icon || '') +
        `<span class="grow">${escapeHtml(it.label)}${it.sub ? `<span class="sub">${escapeHtml(it.sub)}</span>` : ''}</span>` +
        (it.checked ? `<span class="check">${ICONS.tick}</span>` : '');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        it.onClick();
      });
      m.appendChild(b);
    }

    m.hidden = false;
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth;
    const mh = m.offsetHeight;
    let left = r.left;
    let top = r.bottom + 6;
    if (left + mw > innerWidth - 8) left = innerWidth - mw - 8;
    if (top + mh > innerHeight - 8) top = r.top - mh - 6;
    m.style.left = Math.max(8, left) + 'px';
    m.style.top = Math.max(8, top) + 'px';
  }

  function closeMenu() {
    if (els.menu.hidden) return;
    els.menu.hidden = true;
    els.modelBtn.setAttribute('aria-expanded', 'false');
    if (menuOnClose) menuOnClose();
    menuOnClose = null;
  }

  document.addEventListener('mousedown', (e) => {
    if (!els.menu.hidden && !els.menu.contains(e.target) && !e.target.closest('.chat-more, #modelBtn')) closeMenu();
  });
  window.addEventListener('resize', closeMenu);
  els.history.addEventListener('scroll', closeMenu);
  els.thread.addEventListener('scroll', closeMenu);

  /* ---------- model picker ---------- */
  function updateModelLabel() {
    els.modelLabel.textContent = prettyModel(state.model).replace(/^Gemini /, '');
  }

  els.modelBtn.addEventListener('click', () => {
    if (!els.menu.hidden && els.modelBtn.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      return;
    }
    openMenu(els.modelBtn, MODELS.map((id) => ({
      label: prettyModel(id),
      sub: id,
      checked: id === state.model,
      onClick: () => {
        state.model = id;
        store.set('cg.model', id);
        updateModelLabel();
      },
    })), { label: 'Model' });
    els.modelBtn.setAttribute('aria-expanded', 'true');
  });

  /* =========================================================
     Theme — Telegram-style circular reveal from the toggle icon
     ========================================================= */
  function applyTheme(theme) {
    els.root.dataset.theme = theme;
    try { localStorage.setItem('cg-theme', theme); } catch { /* ignore */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#212121' : '#ffffff';
  }

  function toggleTheme() {
    const next = els.root.dataset.theme === 'dark' ? 'light' : 'dark';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!document.startViewTransition || reduceMotion) {
      applyTheme(next);
      return;
    }

    const r = els.themeBtn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const full = `circle(${radius}px at ${x}px ${y}px)`;
    const zero = `circle(0px at ${x}px ${y}px)`;

    // To dark: the new theme grows out of the icon.
    // To light: the old (dark) theme closes back in on the icon.
    const shrink = next === 'light';
    els.root.classList.toggle('theme-shrink', shrink);

    const vt = document.startViewTransition(() => applyTheme(next));
    vt.ready.then(() => {
      els.root.animate(
        { clipPath: shrink ? [full, zero] : [zero, full] },
        {
          duration: 650,
          easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
          fill: 'forwards',
          pseudoElement: shrink ? '::view-transition-old(root)' : '::view-transition-new(root)',
        }
      );
    }).catch(() => {});
    vt.finished.finally(() => els.root.classList.remove('theme-shrink'));
  }

  els.themeBtn.addEventListener('click', toggleTheme);

  /* =========================================================
     Thread rendering
     ========================================================= */
  function setEmpty(empty) {
    els.content.classList.toggle('empty', empty);
    if (empty) els.scrollDownBtn.hidden = true;
  }

  function updateDocTitle() {
    const chat = activeChat();
    document.title = chat ? chat.title : 'ChatGPT';
  }

  function appendUser(text) {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.innerHTML = `<div class="bubble"></div><div class="msg-actions"></div>`;
    el.querySelector('.bubble').textContent = text;
    el.querySelector('.msg-actions').appendChild(makeCopyBtn(() => text, 'Copy'));
    els.messages.appendChild(el);
    return el;
  }

  function appendAssistant() {
    const el = document.createElement('div');
    el.className = 'msg assistant';
    el.innerHTML = `<div class="markdown"></div><div class="msg-actions"></div>`;
    els.messages.appendChild(el);
    return { el, body: el.querySelector('.markdown'), actions: el.querySelector('.msg-actions') };
  }

  function makeCopyBtn(getText, title) {
    const b = document.createElement('button');
    b.className = 'act-btn';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = ICONS.copy;
    b.addEventListener('click', async () => {
      await copyText(getText());
      b.innerHTML = ICONS.check;
      setTimeout(() => { b.innerHTML = ICONS.copy; }, 1500);
    });
    return b;
  }

  function makeRegenBtn(chat, msgEl) {
    const b = document.createElement('button');
    b.className = 'act-btn regen-btn';
    b.title = 'Regenerate';
    b.setAttribute('aria-label', 'Regenerate');
    b.innerHTML = ICONS.regen;
    b.addEventListener('click', () => regenerate(chat, msgEl));
    return b;
  }

  function fillAssistantActions(chat, view, content) {
    els.messages.querySelectorAll('.regen-btn').forEach((b) => b.remove());
    view.actions.innerHTML = '';
    if (content) view.actions.appendChild(makeCopyBtn(() => content, 'Copy'));
    view.actions.appendChild(makeRegenBtn(chat, view.el));
  }

  function renderThread() {
    const chat = activeChat();
    els.messages.innerHTML = '';
    setEmpty(!chat || chat.messages.length === 0);
    if (!chat) return;

    let lastAssistant = null;
    for (const m of chat.messages) {
      if (m.role === 'user') {
        appendUser(m.content);
      } else {
        const view = appendAssistant();
        renderMarkdown(view.body, m.content);
        view.actions.appendChild(makeCopyBtn(() => m.content, 'Copy'));
        lastAssistant = view;
      }
    }
    if (lastAssistant && chat.messages[chat.messages.length - 1].role === 'assistant') {
      lastAssistant.actions.appendChild(makeRegenBtn(chat, lastAssistant.el));
    }
    requestAnimationFrame(() => scrollToBottom(false));
  }

  /* ---------- copy buttons inside code blocks ---------- */
  els.messages.addEventListener('click', async (e) => {
    const btn = e.target.closest('.copy-code');
    if (!btn) return;
    const code = btn.closest('.code-block').querySelector('code');
    await copyText(code.textContent);
    btn.innerHTML = `${ICONS.check}<span>Copied</span>`;
    setTimeout(() => { btn.innerHTML = `${ICONS.copy}<span>Copy code</span>`; }, 1500);
  });

  /* ---------- scrolling ---------- */
  function scrollToBottom(smooth) {
    els.thread.scrollTo({ top: els.thread.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  els.thread.addEventListener('scroll', () => {
    const dist = els.thread.scrollHeight - els.thread.scrollTop - els.thread.clientHeight;
    state.stick = dist < 80;
    els.scrollDownBtn.hidden = dist < 150;
  });
  els.scrollDownBtn.addEventListener('click', () => scrollToBottom(true));

  /* =========================================================
     Navigation
     ========================================================= */
  function stopStreaming() {
    if (state.controller) state.controller.abort();
  }

  function showNewChatView() {
    stopStreaming();
    state.activeId = null;
    renderThread();
    updateDocTitle();
    if (!isMobile()) els.input.focus();
  }

  function newChat() {
    showNewChatView();
    renderSidebar();
    closeMobileSidebar();
  }

  function openChat(id) {
    if (id === state.activeId) {
      closeMobileSidebar();
      return;
    }
    stopStreaming();
    state.activeId = id;
    renderSidebar();
    renderThread();
    updateDocTitle();
    closeMobileSidebar();
  }

  els.newChatBtn.addEventListener('click', newChat);
  els.headerNewChatBtn.addEventListener('click', newChat);
  els.logoBtn.addEventListener('click', newChat);

  /* =========================================================
     Composer
     ========================================================= */
  function autosize() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 216) + 'px';
  }

  function updateSendBtn() {
    els.sendBtn.classList.toggle('is-stop', state.streaming);
    els.sendBtn.setAttribute('aria-label', state.streaming ? 'Stop generating' : 'Send message');
    els.sendBtn.disabled = !state.streaming && !els.input.value.trim();
  }

  els.input.addEventListener('input', () => {
    autosize();
    updateSendBtn();
  });

  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!state.streaming) send();
    }
  });

  els.composer.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.streaming) stopStreaming();
    else send();
  });

  els.composer.addEventListener('mousedown', (e) => {
    if (e.target === els.composer) {
      e.preventDefault();
      els.input.focus();
    }
  });

  /* =========================================================
     Sending & generation
     ========================================================= */
  async function send() {
    const text = els.input.value.trim();
    if (!text || state.streaming) return;

    let chat = activeChat();
    if (!chat) {
      chat = { id: uid(), title: makeTitle(text), messages: [], createdAt: Date.now(), updatedAt: Date.now() };
      state.chats.push(chat);
      state.activeId = chat.id;
    }
    chat.messages.push({ role: 'user', content: text });
    chat.updatedAt = Date.now();
    save();
    renderSidebar();
    updateDocTitle();

    els.input.value = '';
    autosize();
    setEmpty(false);
    appendUser(text);
    state.stick = true;
    scrollToBottom(false);

    await generate(chat);
  }

  function regenerate(chat, msgEl) {
    if (state.streaming) return;
    const last = chat.messages[chat.messages.length - 1];
    if (last && last.role === 'assistant') chat.messages.pop();
    msgEl.remove();
    save();
    generate(chat);
  }

  async function generate(chat) {
    const view = appendAssistant();
    view.body.innerHTML = '<div class="thinking-dot"></div>';
    if (state.stick) scrollToBottom(false);

    const controller = new AbortController();
    state.controller = controller;
    state.streaming = true;
    updateSendBtn();

    let text = '';
    let error = null;
    let raf = 0;
    const paint = () => {
      raf = 0;
      renderMarkdown(view.body, text);
      if (state.stick) scrollToBottom(false);
    };

    try {
      const apiKey = await getApiKey();
      if (!apiKey || /^your_/i.test(apiKey)) {
        apiKeyPromise = null; // re-read .env on the next attempt
        throw new Error(
          location.protocol === 'file:'
            ? 'Open this app through a local server (see README), not as a file — the browser can’t read <code>.env</code> from <code>file://</code>.'
            : 'No Gemini API key found. Create a <code>.env</code> file next to <code>index.html</code> with <code>GEMINI_API_KEY=your_key</code>, then try again.'
        );
      }
      await streamGemini(apiKey, chat.messages, (chunk) => {
        text += chunk;
        if (!raf) raf = requestAnimationFrame(paint);
      }, controller.signal);
    } catch (err) {
      if (err.name !== 'AbortError') error = err;
    } finally {
      if (raf) cancelAnimationFrame(raf);
      if (state.controller === controller) {
        state.controller = null;
        state.streaming = false;
        updateSendBtn();
      }
    }

    // Final render + persist
    if (text) {
      renderMarkdown(view.body, text);
      chat.messages.push({ role: 'assistant', content: text });
      chat.updatedAt = Date.now();
      save();
    } else {
      view.body.innerHTML = '';
    }

    if (error) {
      const box = document.createElement('div');
      box.className = 'error-box';
      box.innerHTML = error.message.includes('<code>') ? error.message : escapeHtml(error.message || 'Something went wrong.');
      view.body.appendChild(box);
    }

    if (!text && !error) {
      view.el.remove(); // stopped before anything arrived
      return;
    }
    fillAssistantActions(chat, view, text);
    if (state.stick) scrollToBottom(false);
  }

  /* ---------- Gemini streaming (SSE) ---------- */
  async function streamGemini(apiKey, messages, onChunk, signal) {
    // Gemini wants alternating user/model turns; merge any consecutive same-role messages.
    const contents = [];
    for (const m of messages) {
      const role = m.role === 'assistant' ? 'model' : 'user';
      const prev = contents[contents.length - 1];
      if (prev && prev.role === role) prev.parts[0].text += '\n\n' + m.content;
      else contents.push({ role, parts: [{ text: m.content }] });
    }

    const res = await fetch(`${API_BASE}${encodeURIComponent(state.model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      }),
      signal,
    });

    if (!res.ok) {
      let msg = `Request failed (${res.status}).`;
      try {
        const j = await res.json();
        if (j.error && j.error.message) msg = j.error.message;
      } catch { /* not JSON */ }
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;

        let json;
        try { json = JSON.parse(line.slice(5)); } catch { continue; }

        if (json.error) throw new Error(json.error.message || 'Gemini returned an error.');
        if (json.promptFeedback && json.promptFeedback.blockReason) {
          throw new Error(`The response was blocked (${json.promptFeedback.blockReason}).`);
        }

        const parts = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [];
        const chunk = parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
        if (chunk) onChunk(chunk);
      }
    }
  }

  /* =========================================================
     Global keys & init
     ========================================================= */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!els.deleteModal.hidden) closeDeleteModal();
      else if (!els.menu.hidden) closeMenu();
      else closeMobileSidebar();
    }
  });

  function init() {
    setupMarkdown();
    if (store.get('cg.sidebarCollapsed', false)) els.body.classList.add('sidebar-collapsed');
    updateModelLabel();
    renderSidebar();
    showNewChatView();
    updateSendBtn();
  }

  init();
})();
