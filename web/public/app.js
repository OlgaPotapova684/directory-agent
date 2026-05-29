const form = document.getElementById('site-form');
const message = document.getElementById('message');
const list = document.getElementById('site-list');
const empty = document.getElementById('empty');
const HTTPS_PREFIX = 'https://';

function initSiteUrlField() {
  const input = form?.siteUrl;
  if (!input) return;

  if (!input.value) input.value = HTTPS_PREFIX;

  input.addEventListener('focus', () => {
    if (!input.value.startsWith('https://') && !input.value.startsWith('http://')) {
      input.value = HTTPS_PREFIX;
    }
    const len = input.value.length;
    input.setSelectionRange(len, len);
  });

  input.addEventListener('blur', () => {
    const v = input.value.trim();
    if (!v || v === 'https://' || v === 'http://') {
      input.value = HTTPS_PREFIX;
      return;
    }
    if (!/^https?:\/\//i.test(v)) {
      input.value = HTTPS_PREFIX + v.replace(/^\/+/, '');
    }
  });

  input.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text').trim();
    if (/^https?:\/\//i.test(text)) {
      e.preventDefault();
      input.value = text;
    }
  });
}

function normalizeSiteUrl(raw) {
  let s = String(raw).trim();
  if (!s || s === 'https://' || s === 'http://') return null;
  if (!/^https?:\/\//i.test(s)) s = HTTPS_PREFIX + s.replace(/^\/+/, '');
  return s;
}

initSiteUrlField();

function isSiteCollapsed(siteId) {
  return localStorage.getItem('site-collapsed-' + siteId) === '1';
}

function setSiteCollapsed(siteId, collapsed) {
  if (collapsed) localStorage.setItem('site-collapsed-' + siteId, '1');
  else localStorage.removeItem('site-collapsed-' + siteId);
}

function showMessage(text, isError) {
  message.hidden = false;
  message.textContent = text;
  message.className = 'message ' + (isError ? 'err' : 'ok');
}

async function loadSites() {
  const res = await fetch('/api/sites');
  const sites = await res.json();

  list.innerHTML = '';
  empty.hidden = sites.length > 0;

  for (const site of sites) {
    const li = document.createElement('li');
    li.className = 'site-card';
    li.dataset.siteId = site.id;
    const collapsed = isSiteCollapsed(site.id);
    if (collapsed) li.classList.add('is-collapsed');

    const header = document.createElement('div');
    header.className = 'site-header';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'toggle-btn';
    toggleBtn.textContent = collapsed ? '▶' : '▼';
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    toggleBtn.title = 'Свернуть / развернуть';
    function applyCollapsedState(nowCollapsed) {
      li.classList.toggle('is-collapsed', nowCollapsed);
      toggleBtn.textContent = nowCollapsed ? '▶' : '▼';
      toggleBtn.setAttribute('aria-expanded', String(!nowCollapsed));
      setSiteCollapsed(site.id, nowCollapsed);
    }

    function toggleCollapsed() {
      applyCollapsedState(!li.classList.contains('is-collapsed'));
    }

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCollapsed();
    });

    const summary = document.createElement('div');
    summary.className = 'site-summary';
    summary.innerHTML =
      '<div class="site-url">' +
      escapeHtml(site.siteUrl) +
      '</div><div class="site-summary-meta">' +
      escapeHtml(site.email) +
      '</div>';

    header.appendChild(toggleBtn);
    header.appendChild(summary);
    header.addEventListener('click', toggleCollapsed);
    li.appendChild(header);

    const details = document.createElement('div');
    details.className = 'site-details';

    const scrapedBits = [];
    if (site.scrapedTitle) scrapedBits.push('заголовок: ' + escapeHtml(site.scrapedTitle));
    else scrapedBits.push('<span class="no-data">данные ещё не собраны</span>');
    if (site.logoPath) {
      /* уже в блоке «логотип скачан» */
    } else if (site.scrapedLogoUrl) {
      scrapedBits.push('лого: найдено (можно скачать)');
    } else if (site.scrapedAt) {
      scrapedBits.push('<span class="no-data">логотип на сайте не найден</span>');
    }
    if (site.scrapedAt) scrapedBits.push('обновлено: ' + new Date(site.scrapedAt).toLocaleString('ru-RU'));

    const logoFile = site.logoPath ? site.logoPath.split('/').pop() : null;
    const logoImg = logoFile
      ? '<img class="logo-preview" src="/logos/' + encodeURIComponent(logoFile) + '?site=' + site.id + '" alt="Логотип" />'
      : '';

    details.insertAdjacentHTML(
      'afterbegin',
      '<div class="site-row-top">' +
        logoImg +
        '<div class="site-main">' +
        '<div class="site-url">' +
        escapeHtml(site.siteUrl) +
        '</div>' +
        '<div class="site-id">id: ' +
        site.id +
        '</div>' +
        '<div class="site-meta">' +
        escapeHtml(site.email) +
        ' · ' +
        escapeHtml(site.status) +
        ' · ' +
        new Date(site.createdAt).toLocaleString('ru-RU') +
        (scrapedBits.length ? '<br />' + scrapedBits.join(' · ') : '') +
        (site.logoPath ? '<br /><span class="logo-ok">логотип скачан</span>' : '') +
        '</div></div></div>'
    );

    const profile = document.createElement('div');
    profile.className = 'company-profile';
    profile.innerHTML =
      '<div class="company-profile-title">Профиль компании (для каталогов)</div>' +
      '<dl class="profile-dl">' +
      profileRow('Название', site.scrapedTitle) +
      profileRow('Описание', truncate(site.scrapedDescription, 200)) +
      profileRow('Сайт', site.siteUrl) +
      profileRow('Email для регистрации', site.email) +
      profileRow('Логотип', site.logoPath ? 'скачан (' + site.logoPath + ')' : 'нет') +
      '</dl>' +
      (!site.scrapedTitle
        ? '<p class="hint profile-warn">Сначала нажмите «Собрать данные с сайта» у этой карточки.</p>'
        : '');

    const row = document.createElement('div');
    row.className = 'row';

    const btn = document.createElement('button');
    btn.className = 'small-btn';
    btn.textContent = 'Собрать данные с сайта';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Собираю...';
      try {
        const r = await fetch('/api/sites/' + site.id + '/scrape', { method: 'POST' });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || 'Ошибка');
        showMessage('Данные собраны', false);
        await loadSites();
      } catch (e) {
        showMessage(e.message || 'Ошибка', true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Собрать данные с сайта';
      }
    });

    row.appendChild(btn);

    const btnLogo = document.createElement('button');
    btnLogo.className = 'small-btn';
    btnLogo.textContent = 'Скачать логотип';
    btnLogo.disabled = !site.scrapedLogoUrl;
    if (!site.scrapedLogoUrl) {
      btnLogo.title = site.scrapedAt
        ? 'Логотип не найден при сборе данных'
        : 'Сначала нажмите «Собрать данные с сайта»';
    }
    btnLogo.addEventListener('click', async () => {
      btnLogo.disabled = true;
      const prevText = btnLogo.textContent;
      btnLogo.textContent = 'Скачиваю...';
      try {
        const r = await fetch('/api/sites/' + site.id + '/download-logo', { method: 'POST' });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || 'Ошибка');
        showMessage('Логотип скачан', false);
        await loadSites();
      } catch (e) {
        showMessage(e.message || 'Ошибка', true);
      } finally {
        btnLogo.textContent = prevText;
        // после loadSites() состояние кнопки обновится; на всякий случай включим обратно
        btnLogo.disabled = false;
      }
    });

    row.appendChild(btnLogo);

    const btnQueue = document.createElement('button');
    btnQueue.className = 'small-btn';
    btnQueue.textContent = 'Создать очередь (5 каталогов)';
    btnQueue.addEventListener('click', async () => {
      btnQueue.disabled = true;
      btnQueue.textContent = 'Создаю...';
      try {
        const r = await fetch('/api/sites/' + site.id + '/init-catalogs', { method: 'POST' });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || 'Ошибка');
        showMessage('Очередь создана: ' + b.count + ' каталогов', false);
        await renderCatalogTable(site.id, li);
      } catch (e) {
        showMessage(e.message || 'Ошибка', true);
      } finally {
        btnQueue.disabled = false;
        btnQueue.textContent = 'Создать очередь (5 каталогов)';
      }
    });
    row.appendChild(btnQueue);

    const btnWorker = document.createElement('button');
    btnWorker.className = 'small-btn';
    btnWorker.textContent = 'Запустить 1 задачу (тест браузера)';
    btnWorker.addEventListener('click', async () => {
      btnWorker.disabled = true;
      btnWorker.textContent = 'Браузер...';
      try {
        const r = await fetch('/api/sites/' + site.id + '/worker/run-once', { method: 'POST' });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || 'Ошибка');
        if (!b.job) {
          showMessage(b.message || 'Нет задач «ожидает» — нажмите «Сбросить очередь»', true);
        } else if (b.job.status === 'учётные данные' || b.job.status === 'форма заполнена') {
          showMessage(b.job.catalogName + ': ' + b.job.status + ' (логин/пароль в таблице)', false);
        } else if (b.job.status === 'ожидает код') {
          showMessage(b.job.catalogName + ': ждём код (используйте «Забрать код»)', false);
        } else if (b.job.status === 'email введён') {
          showMessage('Email введён: ' + b.job.catalogName, false);
        } else if (b.job.status === 'страница открыта') {
          showMessage('Открыта страница: ' + b.job.catalogName, false);
        } else if (b.job.status === 'тест пройден') {
          showMessage('Тест пройден: ' + b.job.catalogName, false);
        } else if (b.job.status === 'ошибка') {
          showMessage('Ошибка: ' + (b.job.error || b.job.catalogName), true);
        } else {
          showMessage(b.job.catalogName + ': ' + b.job.status, false);
        }
        await renderCatalogTable(site.id, li);
      } catch (e) {
        showMessage(e.message || 'Ошибка', true);
      } finally {
        btnWorker.disabled = false;
        btnWorker.textContent = 'Запустить 1 задачу (тест браузера)';
      }
    });
    row.appendChild(btnWorker);

    const btnPickCode = document.createElement('button');
    btnPickCode.className = 'small-btn';
    btnPickCode.textContent = 'Забрать код (симуляция)';
    btnPickCode.addEventListener('click', async () => {
      btnPickCode.disabled = true;
      try {
        const r = await fetch('/api/sites/' + site.id + '/worker/pick-code', { method: 'POST' });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || 'Ошибка');
        showMessage(b.message || 'Готово', false);
        await renderCatalogTable(site.id, li);
      } catch (e) {
        showMessage(e.message || 'Ошибка', true);
      } finally {
        btnPickCode.disabled = false;
      }
    });
    row.appendChild(btnPickCode);

    const btnRunToCode = document.createElement('button');
    btnRunToCode.className = 'small-btn';
    btnRunToCode.textContent = 'Прогнать до кода (симуляция)';
    btnRunToCode.addEventListener('click', async () => {
      btnRunToCode.disabled = true;
      const prev = btnRunToCode.textContent;
      btnRunToCode.textContent = 'Делаю...';
      try {
        const r = await fetch('/api/sites/' + site.id + '/worker/run-to-code', { method: 'POST' });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || 'Ошибка');
        showMessage(b.message || 'Готово', false);
        await renderCatalogTable(site.id, li);
      } catch (e) {
        showMessage(e.message || 'Ошибка', true);
      } finally {
        btnRunToCode.disabled = false;
        btnRunToCode.textContent = prev;
      }
    });
    row.appendChild(btnRunToCode);

    const btnRunToVerified = document.createElement('button');
    btnRunToVerified.className = 'small-btn';
    btnRunToVerified.textContent = 'Прогнать до подтверждения (учебный)';
    btnRunToVerified.addEventListener('click', async () => {
      btnRunToVerified.disabled = true;
      const prev = btnRunToVerified.textContent;
      btnRunToVerified.textContent = 'Делаю...';
      try {
        const r = await fetch('/api/sites/' + site.id + '/worker/run-to-verified', { method: 'POST' });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || 'Ошибка');
        showMessage(b.message || 'Готово', !b.ok && b.message?.includes('Нужен'));
        await renderCatalogTable(site.id, li);
      } catch (e) {
        showMessage(e.message || 'Ошибка', true);
      } finally {
        btnRunToVerified.disabled = false;
        btnRunToVerified.textContent = prev;
      }
    });
    row.appendChild(btnRunToVerified);

    const btnReset = document.createElement('button');
    btnReset.className = 'small-btn';
    btnReset.textContent = 'Сбросить очередь';
    btnReset.addEventListener('click', async () => {
      if (!confirm('Все 5 каталогов снова станут «ожидает». Продолжить?')) return;
      btnReset.disabled = true;
      try {
        const r = await fetch('/api/sites/' + site.id + '/reset-catalog-runs', { method: 'POST' });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || 'Ошибка');
        showMessage('Очередь сброшена (' + b.updated + ' задач)', false);
        await renderCatalogTable(site.id, li);
      } catch (e) {
        showMessage(e.message || 'Ошибка', true);
      } finally {
        btnReset.disabled = false;
      }
    });
    row.appendChild(btnReset);

    const btnClear = document.createElement('button');
    btnClear.className = 'small-btn';
    btnClear.textContent = 'Очистить данные сайта';
    btnClear.addEventListener('click', async () => {
      if (!confirm('Удалить заголовок, описание и логотип только у этого сайта?')) return;
      btnClear.disabled = true;
      try {
        const r = await fetch('/api/sites/' + site.id + '/clear-scraped', { method: 'POST' });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || 'Ошибка');
        showMessage('Данные сайта очищены', false);
        await loadSites();
      } catch (e) {
        showMessage(e.message || 'Ошибка', true);
      } finally {
        btnClear.disabled = false;
      }
    });
    row.appendChild(btnClear);

    details.appendChild(profile);
    details.appendChild(row);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'catalog-table-wrap';
    tableWrap.dataset.siteId = site.id;
    details.appendChild(tableWrap);

    li.appendChild(details);
    await renderCatalogTable(site.id, li);

    list.appendChild(li);
  }
}

async function renderCatalogTable(siteId, li) {
  const wrap = li.querySelector('.catalog-table-wrap');
  if (!wrap) return;

  const res = await fetch('/api/sites/' + siteId + '/catalog-runs');
  const runs = await res.json();

  if (!runs.length) {
    wrap.innerHTML = '<p class="hint catalog-hint">Очередь каталогов ещё не создана.</p>';
    return;
  }

  let html =
    '<table class="catalog-table"><thead><tr>' +
    '<th>Каталог</th><th>Статус</th><th>Результат</th><th>Логин</th><th>Пароль</th><th>Код</th>' +
    '</tr></thead><tbody>';

  for (const run of runs) {
    html +=
      '<tr><td>' +
      escapeHtml(run.catalogName) +
      '</td><td>' +
      escapeHtml(run.status) +
      '</td><td class="result-cell">' +
      escapeHtml(run.profileUrl || run.error || '—') +
      '</td><td>' +
      escapeHtml(run.login || '—') +
      '</td><td>' +
      escapeHtml(run.password || '—') +
      '</td><td>' +
      escapeHtml(run.verificationCode || '—') +
      '</td></tr>';
  }

  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function profileRow(label, value) {
  return (
    '<dt>' +
    escapeHtml(label) +
    '</dt><dd>' +
    (value ? escapeHtml(value) : '<span class="no-data">—</span>') +
    '</dd>'
  );
}

function truncate(text, max) {
  if (!text) return null;
  const s = String(text);
  return s.length <= max ? s : s.slice(0, max) + '…';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  message.hidden = true;

  const siteUrl = normalizeSiteUrl(form.siteUrl.value);
  if (!siteUrl) {
    showMessage('Введите адрес сайта после https://', true);
    return;
  }

  const data = {
    siteUrl,
    email: form.email.value,
  };

  const res = await fetch('/api/sites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  const body = await res.json();

  if (!res.ok) {
    showMessage(body.error || 'Ошибка', true);
    return;
  }

  showMessage(body.message || 'Сайт сохранён — соберите данные у новой карточки ниже', false);
  form.reset();
  form.siteUrl.value = HTTPS_PREFIX;
  await loadSites();
});

async function loadCatalogSettings() {
  const input = document.getElementById('catalog-01-url');
  const saveBtn = document.getElementById('save-catalog-01');
  const useTrainingBtn = document.getElementById('use-training-catalog');
  const openTrainingBtn = document.getElementById('open-training-catalog');
  if (!input || !saveBtn) return;

  const res = await fetch('/api/catalogs');
  const catalogs = await res.json();
  const c1 = catalogs.find((c) => c.id === 'catalog-01');
  if (c1?.registerUrl) input.value = c1.registerUrl;

  saveBtn.addEventListener('click', async () => {
    const registerUrl = input.value.trim();
    if (!registerUrl) {
      showMessage('Вставьте URL регистрации', true);
      return;
    }
    const r = await fetch('/api/catalogs/catalog-01', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registerUrl }),
    });
    const b = await r.json();
    if (!r.ok) {
      showMessage(b.error || 'Ошибка', true);
      return;
    }
    showMessage('URL каталога 1 сохранён', false);
  });

  if (useTrainingBtn) {
    useTrainingBtn.addEventListener('click', async () => {
      input.value = 'http://localhost:3000/training-catalog/register';
      // сразу сохраняем
      const r = await fetch('/api/catalogs/catalog-01', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registerUrl: input.value }),
      });
      const b = await r.json();
      if (!r.ok) {
        showMessage(b.error || 'Ошибка', true);
        return;
      }
      showMessage('Учебный каталог подключён (каталог 1)', false);
    });
  }

  if (openTrainingBtn) {
    openTrainingBtn.addEventListener('click', () => {
      window.open('/training-catalog', '_blank', 'noopener,noreferrer');
    });
  }
}

loadCatalogSettings();
loadSites();
