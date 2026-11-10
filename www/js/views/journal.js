// Journal list + entry editor
import { h, icon, iconBtn, toast, confirmDialog, openSheet, fmtDate, parseDate, MONTHS, WEEKDAYS, MOODS, debounce, sanitize, todayStr, busy } from '../ui.js';
import * as store from '../store.js';
import * as ai from '../ai.js';
import { tagChips, tagInput, mediaThumb, recordVoice, emptyState, pageHead } from '../components.js';
import { pickFile } from '../native.js';

let filter = { fav: false, tag: '' };

export function renderList(root) {
  const all = store.entries();
  let list = all;
  if (filter.fav) list = list.filter(e => e.favorite);
  if (filter.tag) list = list.filter(e => (e.tags || []).includes(filter.tag));

  const streak = store.streak();
  const memories = store.onThisDay();
  const tags = store.allTags();

  root.append(pageHead('Journal',
    h('button', { class: 'btn ai-glow-btn slim', type: 'button', title: 'Life Insights & Analytics', onclick: () => openLifeInsights(root) }, icon('sparkles', 16), h('span', { class: 'hide-sm' }, 'Life Insights')),
    streak ? h('span', { class: 'pill ribbon', title: 'Days in a row with an entry' }, `${streak}-day streak`) : null,
    h('a', { class: 'btn primary', href: '#/journal/new' }, icon('plus'), h('span', { class: 'hide-sm' }, 'New entry'))));

  if (all.length) {
    root.append(h('div', { class: 'filters' },
      h('button', { class: 'chip' + (!filter.fav ? ' on' : ''), onclick: () => { filter.fav = false; rerender(root); } }, 'All entries'),
      h('button', { class: 'chip' + (filter.fav ? ' on' : ''), onclick: () => { filter.fav = true; rerender(root); } }, icon('star', 16), 'Favorites'),
      tags.length ? h('select', { class: 'chip select', 'aria-label': 'Filter by tag', onchange: (e) => { filter.tag = e.target.value; rerender(root); } },
        h('option', { value: '' }, 'Any tag'),
        tags.map(t => h('option', { value: t.name, selected: filter.tag === t.name }, '#' + t.name))) : null
    ));
  }

  if (memories.length && !filter.fav && !filter.tag) {
    root.append(h('section', { class: 'memory' },
      h('h2', {}, 'On this day'),
      memories.slice(0, 3).map(e => h('a', { class: 'memory-row', href: '#/journal/' + e.id },
        h('span', { class: 'memory-year' }, e.date.slice(0, 4)),
        h('span', { class: 'grow ellipsis' }, e.title || e.text.slice(0, 80) || 'Untitled entry')))));
  }

  if (!list.length) {
    root.append(all.length
      ? emptyState('search', 'Nothing matches this filter', 'Try another tag or show all entries.')
      : emptyState('journal', 'Your journal is empty', 'Write about your day, add photos or a voice note. Everything stays encrypted.',
        h('a', { class: 'btn primary', href: '#/journal/new' }, icon('plus'), 'Write first entry')));
    return;
  }

  let lastMonth = '';
  const wrap = h('div', { class: 'entries' });
  for (const e of list) {
    const m = e.date.slice(0, 7);
    if (m !== lastMonth) {
      lastMonth = m;
      const d = parseDate(e.date);
      wrap.append(h('h2', { class: 'month' }, `${MONTHS[d.getMonth()]} ${d.getFullYear()}`));
    }
    wrap.append(entryCard(e));
  }
  root.append(wrap);
}

function rerender(root) { root.innerHTML = ''; renderList(root); }

export function entryCard(e) {
  const d = parseDate(e.date);
  const mood = MOODS.find(m => m.v === e.mood);
  const media = (e.media || []).filter(id => store.db.get(id));
  return h('a', { class: 'entry-card', href: '#/journal/' + e.id },
    h('div', { class: 'date-block', style: mood ? { '--mood': mood.c } : null },
      h('span', { class: 'day' }, d.getDate()),
      h('span', { class: 'wd' }, WEEKDAYS[d.getDay()].slice(0, 3))),
    h('div', { class: 'entry-body' },
      h('h3', {}, e.title || (e.text ? e.text.slice(0, 60) : 'Untitled entry'), e.favorite ? icon('star', 15, 'fav') : null),
      e.text && e.title ? h('p', { class: 'excerpt' }, e.text.slice(0, 180)) : null,
      h('div', { class: 'meta' },
        mood ? h('span', { title: mood.label }, mood.e) : null,
        e.time ? h('span', {}, e.time) : null,
        media.length ? h('span', { class: 'row gap-xs' }, icon('clip', 14), media.length) : null,
        tagChips(e.tags))));
}

// ---------- Life Insights Modal Sheet ----------
export function openLifeInsights(root) {
  let periodDays = 7;
  const contentWrap = h('div', { class: 'stack' });

  const renderContent = () => {
    contentWrap.innerHTML = '';
    const insights = ai.generateLifeInsights(store.entries(), store.tasks(), periodDays);

    // Period toggle
    const toggleRow = h('div', { class: 'row between gap wrap' },
      h('div', { class: 'filters', style: 'margin: 0;' },
        h('button', { class: 'chip' + (periodDays === 7 ? ' on' : ''), onclick: () => { periodDays = 7; renderContent(); } }, 'Last 7 Days'),
        h('button', { class: 'chip' + (periodDays === 30 ? ' on' : ''), onclick: () => { periodDays = 30; renderContent(); } }, 'Last 30 Days')
      ),
      h('span', { class: 'chip on', style: 'border-color: var(--success); color: var(--success); font-size: 11.5px;' }, '100% On-Device • Private')
    );

    // Stat cards
    const statsGrid = h('div', { class: 'insights-grid' },
      h('div', { class: 'insight-stat-card' },
        h('span', { class: 'insight-stat-val' }, String(insights.totalEntries)),
        h('span', { class: 'insight-stat-label' }, `Entries (${insights.activeDays} active days)`)
      ),
      h('div', { class: 'insight-stat-card' },
        h('span', { class: 'insight-stat-val' }, `${insights.consistencyRate}%`),
        h('span', { class: 'insight-stat-label' }, 'Consistency rate')
      ),
      h('div', { class: 'insight-stat-card' },
        h('span', { class: 'insight-stat-val' }, insights.dominantMood.emoji + ' ' + insights.dominantMood.label),
        h('span', { class: 'insight-stat-label' }, `Dominant mood (${insights.avgMood ? insights.avgMood + '/5' : '—'})`)
      ),
      h('div', { class: 'insight-stat-card' },
        h('span', { class: 'insight-stat-val' }, insights.totalWords.toLocaleString()),
        h('span', { class: 'insight-stat-label' }, `Total words (~${insights.avgWords}/entry)`)
      )
    );

    // Mood distribution bar
    const totalMoodLogs = Object.values(insights.moodCounts).reduce((a, b) => a + b, 0);
    const moodMeta = [
      { v: 5, e: '😄', label: 'Great', c: '#10B981' },
      { v: 4, e: '🙂', label: 'Good', c: '#3B82F6' },
      { v: 3, e: '😐', label: 'Okay', c: '#6B7280' },
      { v: 2, e: '🙁', label: 'Down', c: '#F59E0B' },
      { v: 1, e: '😣', label: 'Rough', c: '#EF4444' }
    ];

    let moodBarSection = null;
    if (totalMoodLogs > 0) {
      moodBarSection = h('div', { class: 'stack-sm' },
        h('div', { class: 'row between' },
          h('b', { style: 'font-size: 13px;' }, 'Mood Distribution'),
          h('small', { class: 'muted' }, insights.moodTrend)
        ),
        h('div', { class: 'mood-dist-bar' },
          moodMeta.map(m => {
            const count = insights.moodCounts[m.v] || 0;
            const pct = (count / totalMoodLogs) * 100;
            return pct > 0 ? h('div', { class: 'mood-dist-seg', style: `width: ${pct}%; background: ${m.c};`, title: `${m.label}: ${count} (${Math.round(pct)}%)` }) : null;
          })
        ),
        h('div', { class: 'row gap wrap', style: 'font-size: 12px;' },
          moodMeta.map(m => {
            const count = insights.moodCounts[m.v] || 0;
            return count > 0 ? h('span', { class: 'row gap-xs muted' }, h('i', { class: 'dot', style: `background: ${m.c};` }), `${m.e} ${m.label}: ${count}`) : null;
          })
        )
      );
    }

    // Top tags & correlation
    let tagsSection = null;
    if (insights.topTags.length > 0) {
      tagsSection = h('div', { class: 'stack-sm' },
        h('b', { style: 'font-size: 13px;' }, 'Key Topics & Habits'),
        h('div', { class: 'row gap wrap' },
          insights.topTags.map(t => h('span', { class: 'chip on' }, `#${t.tag} (${t.count})`))
        ),
        insights.happiestTag ? h('p', { class: 'hint', style: 'margin: 4px 0 0;' },
          `✨ Entries tagged with `, h('b', {}, `#${insights.happiestTag}`), ` coincided with your most positive mood ratings!`
        ) : null
      );
    }

    // Executive summary narrative
    const narrativeSection = h('div', { class: 'stack-sm' },
      h('div', { class: 'row between' },
        h('b', { style: 'font-size: 13px;' }, 'AI Life Digest'),
        h('span', { class: 'hint' }, `Cactus Needle Engine`)
      ),
      h('div', { class: 'insight-report-text' }, insights.executiveSummary)
    );

    // Key Highlights if any
    let highlightsSection = null;
    if (insights.topHighlights.length > 0) {
      highlightsSection = h('div', { class: 'stack-sm' },
        h('b', { style: 'font-size: 13px;' }, 'Key Takeaways & Highlights'),
        h('ul', { style: 'padding-left: 18px; margin: 4px 0; font-size: 13px; line-height: 1.6;' },
          insights.topHighlights.map(hl => h('li', {}, hl))
        )
      );
    }

    // Action buttons: Save as Entry or Copy Summary
    const actionsRow = h('div', { class: 'row end gap wrap', style: 'margin-top: 10px; border-top: 1px solid var(--line); padding-top: 14px;' },
      h('button', {
        class: 'btn ghost',
        type: 'button',
        onclick: () => {
          navigator.clipboard.writeText(insights.executiveSummary);
          toast('Life Digest copied to clipboard!', 'success');
        }
      }, icon('copy'), 'Copy Digest'),
      h('button', {
        class: 'btn primary',
        type: 'button',
        onclick: async () => {
          const title = `${periodDays === 7 ? 'Weekly' : 'Monthly'} Review (${fmtDate(new Date(Date.now() - periodDays * 86400000))} - ${fmtDate(new Date())})`;
          const bodyHtml = `<h2>${title}</h2><p>${insights.executiveSummary.replace(/\n\n/g, '</p><p>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')}</p>` +
            (insights.topHighlights.length ? `<h3>Key Highlights</h3><ul>${insights.topHighlights.map(hl => `<li>${hl}</li>`).join('')}</ul>` : '');
          const newE = store.newEntry();
          newE.title = title;
          newE.html = bodyHtml;
          newE.tags = ['review', 'insights'];
          newE.mood = insights.dominantMood ? (insights.dominantMood.label === 'Great' ? 5 : insights.dominantMood.label === 'Good' ? 4 : 3) : 3;
          const saved = await store.saveEntry(newE);
          sheet.close();
          toast('Review saved to your journal!', 'success');
          location.hash = '#/journal/' + saved.id;
        }
      }, icon('plus'), 'Save as Journal Entry')
    );

    contentWrap.append(
      toggleRow,
      statsGrid,
      moodBarSection || h('span'),
      tagsSection || h('span'),
      narrativeSection,
      highlightsSection || h('span'),
      actionsRow
    );
  };

  renderContent();
  const sheet = openSheet(contentWrap, { title: 'Life Insights & Analytics', wide: true });
}

// ---------- Editor ----------
export function renderEditor(root, id, params) {
  let entry = id === 'new' ? store.newEntry(params.get('date')) : store.db.get(id);
  if (!entry) { root.append(emptyState('journal', 'Entry not found', 'It may have been deleted.', h('a', { class: 'btn', href: '#/journal' }, 'Back to journal'))); return; }
  entry = JSON.parse(JSON.stringify(entry));
  const isEmpty = () => !entry.title.trim() && !entry.html.replace(/<[^>]*>|&nbsp;/g, '').trim() && !(entry.media || []).length;

  const status = h('span', { class: 'save-status muted' }, entry.id ? 'Saved' : 'Draft');
  let deleted = false;
  const persist = async () => {
    if (deleted || (!entry.id && isEmpty())) return;
    entry.html = sanitize(body.innerHTML);
    const wasNew = !entry.id;
    const saved = await store.saveEntry(entry);
    if (wasNew) history.replaceState(null, '', '#/journal/' + saved.id);
    status.textContent = 'Saved';
  };
  const save = debounce(() => persist().catch(e => toast(e.message, 'error')), 700);
  const touch = () => { status.textContent = 'Saving…'; save(); };

  // Top bar
  const dateInput = h('input', { type: 'date', class: 'input slim', value: entry.date, 'aria-label': 'Entry date', onchange: (e) => { entry.date = e.target.value || todayStr(); touch(); } });
  const timeInput = h('input', { type: 'time', class: 'input slim', value: entry.time || '', 'aria-label': 'Entry time', onchange: (e) => { entry.time = e.target.value; touch(); } });
  const favBtn = iconBtn('star', 'Favorite', () => { entry.favorite = !entry.favorite; favBtn.classList.toggle('on', entry.favorite); touch(); }, entry.favorite ? 'on fav-btn' : 'fav-btn');
  const delBtn = iconBtn('trash', 'Delete entry', async () => {
    if (!entry.id) { location.hash = '#/journal'; return; }
    if (!(await confirmDialog('This entry and its attachments will be deleted permanently.'))) return;
    deleted = true;
    await store.deleteEntry(store.db.get(entry.id) || entry);
    toast('Entry deleted');
    location.hash = '#/journal';
  });

  // Title + mood
  const title = h('input', { class: 'title-input', placeholder: 'Title', value: entry.title, 'aria-label': 'Title', oninput: (e) => { entry.title = e.target.value; touch(); } });
  const moods = h('div', { class: 'moods', role: 'radiogroup', 'aria-label': 'Mood' }, MOODS.map(m =>
    h('button', { type: 'button', class: 'mood' + (entry.mood === m.v ? ' on' : ''), role: 'radio', 'aria-checked': String(entry.mood === m.v), title: m.label, style: { '--mood': m.c },
      onclick: (e) => {
        entry.mood = entry.mood === m.v ? null : m.v;
        moods.querySelectorAll('.mood').forEach((b, i) => { b.classList.toggle('on', MOODS[i].v === entry.mood); b.setAttribute('aria-checked', String(MOODS[i].v === entry.mood)); });
        touch();
      } }, h('span', {}, m.e), h('small', {}, m.label))));

  // Rich text editor
  const body = h('div', { class: 'rich', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Write your entry', 'data-placeholder': 'Write about your day…', html: sanitize(entry.html) });
  body.addEventListener('input', touch);
  body.addEventListener('paste', (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, html ? sanitize(html) : text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\n/g, '<br>'));
  });
  const cmd = (c, v) => () => { body.focus(); document.execCommand(c, false, v); touch(); };

  // Colors for text picker & highlighter
  const TEXT_COLORS = [
    { name: 'Default', value: 'inherit' },
    { name: 'Red', value: '#DC2626' },
    { name: 'Orange', value: '#EA580C' },
    { name: 'Amber', value: '#D97706' },
    { name: 'Emerald', value: '#16A34A' },
    { name: 'Teal', value: '#0D9488' },
    { name: 'Blue', value: '#2563EB' },
    { name: 'Purple', value: '#7C3AED' },
    { name: 'Pink', value: '#DB2777' },
    { name: 'Black', value: '#111827' },
    { name: 'Muted Gray', value: '#6B7280' }
  ];

  const HIGHLIGHT_COLORS = [
    { name: 'Yellow', value: '#FEF08A' },
    { name: 'Green', value: '#BBF7D0' },
    { name: 'Blue', value: '#BAE6FD' },
    { name: 'Pink', value: '#FBCFE8' },
    { name: 'Orange', value: '#FED7AA' },
    { name: 'Remove', value: 'transparent' }
  ];

  const colorBarWrap = h('div', { class: 'color-bar-container' });
  let activeColorBar = null;

  const closeColorBar = () => {
    colorBarWrap.innerHTML = '';
    activeColorBar = null;
  };

  const toggleColorBar = (type) => {
    if (activeColorBar === type) {
      closeColorBar();
      return;
    }
    activeColorBar = type;
    colorBarWrap.innerHTML = '';

    const pop = h('div', { class: 'color-bar-popover' });
    if (type === 'text') {
      pop.append(h('small', { class: 'muted', style: 'font-weight: 600; margin-right: 4px;' }, 'Text Color:'));
      TEXT_COLORS.forEach(c => {
        if (c.value === 'inherit') {
          pop.append(h('button', {
            class: 'color-pill clear-pill',
            type: 'button',
            title: 'Default color',
            onmousedown: (e) => e.preventDefault(),
            onclick: () => {
              body.focus();
              document.execCommand('foreColor', false, 'inherit');
              touch();
              closeColorBar();
            }
          }, 'Default'));
        } else {
          pop.append(h('button', {
            class: 'color-pill',
            type: 'button',
            title: c.name,
            style: `background: ${c.value};`,
            onmousedown: (e) => e.preventDefault(),
            onclick: () => {
              body.focus();
              document.execCommand('foreColor', false, c.value);
              touch();
              closeColorBar();
            }
          }));
        }
      });
      // Custom color
      const customInput = h('input', {
        type: 'color',
        title: 'Custom color',
        style: 'width: 26px; height: 26px; border: 0; padding: 0; background: transparent; cursor: pointer; border-radius: 50%;',
        onmousedown: (e) => e.stopPropagation(),
        onchange: (e) => {
          body.focus();
          document.execCommand('foreColor', false, e.target.value);
          touch();
          closeColorBar();
        }
      });
      pop.append(customInput);
    } else if (type === 'highlight') {
      pop.append(h('small', { class: 'muted', style: 'font-weight: 600; margin-right: 4px;' }, 'Highlight:'));
      HIGHLIGHT_COLORS.forEach(c => {
        if (c.value === 'transparent') {
          pop.append(h('button', {
            class: 'color-pill clear-pill',
            type: 'button',
            title: 'Clear highlight',
            onmousedown: (e) => e.preventDefault(),
            onclick: () => {
              body.focus();
              document.execCommand('hiliteColor', false, 'transparent');
              touch();
              closeColorBar();
            }
          }, 'Clear'));
        } else {
          pop.append(h('button', {
            class: 'color-pill',
            type: 'button',
            title: c.name,
            style: `background: ${c.value};`,
            onmousedown: (e) => e.preventDefault(),
            onclick: () => {
              body.focus();
              document.execCommand('hiliteColor', false, c.value);
              touch();
              closeColorBar();
            }
          }));
        }
      });
    }

    colorBarWrap.append(pop);
  };

  const fontSelect = h('select', {
    class: 'toolbar-select',
    title: 'Font family',
    'aria-label': 'Font family',
    onmousedown: (e) => e.stopPropagation(),
    onchange: (e) => {
      const f = e.target.value;
      if (!f) return;
      body.focus();
      document.execCommand('fontName', false, f);
      touch();
      fontSelect.value = '';
    }
  },
    h('option', { value: '' }, 'Font…'),
    h('option', { value: "'Literata', Georgia, serif" }, 'Literata (Serif)'),
    h('option', { value: "'Manrope', sans-serif" }, 'Manrope (Sans)'),
    h('option', { value: 'Georgia, serif' }, 'Georgia'),
    h('option', { value: 'Arial, sans-serif' }, 'Arial'),
    h('option', { value: 'Courier New, monospace' }, 'Monospace'),
    h('option', { value: 'cursive' }, 'Handwriting')
  );

  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
    fontSelect,
    h('div', { class: 'toolbar-sep' }),
    iconBtn('bold', 'Bold', cmd('bold')),
    iconBtn('italic', 'Italic', cmd('italic')),
    iconBtn('underline', 'Underline', cmd('underline')),
    h('div', { class: 'toolbar-sep' }),
    iconBtn('textColor', 'Text Color', () => toggleColorBar('text')),
    iconBtn('highlighter', 'Highlight Color', () => toggleColorBar('highlight')),
    h('div', { class: 'toolbar-sep' }),
    iconBtn('heading', 'Heading', cmd('formatBlock', '<h2>')),
    iconBtn('quote', 'Quote', cmd('formatBlock', '<blockquote>')),
    iconBtn('ul', 'Bulleted list', cmd('insertUnorderedList')),
    iconBtn('ol', 'Numbered list', cmd('insertOrderedList')),
    h('button', { class: 'icon-btn text', type: 'button', title: 'Normal text', 'aria-label': 'Normal text', onclick: cmd('formatBlock', '<p>') }, 'Aa'),
    h('div', { class: 'toolbar-sep' }),
    iconBtn('sparkles', 'AI Studio', () => openAiStudio(), 'ai-glow')
  );
  toolbar.addEventListener('mousedown', (e) => {
    if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'INPUT') {
      e.preventDefault(); // keep selection in editor
    }
  });

  // Attachments
  const strip = h('div', { class: 'thumbs' });
  const drawStrip = () => {
    strip.innerHTML = '';
    (entry.media || []).forEach(mid => {
      const t = mediaThumb(mid, { onRemove: async (rid) => {
        if (!(await confirmDialog('Remove this attachment?', { ok: 'Remove' }))) return;
        await store.deleteMedia(rid);
        entry.media = entry.media.filter(x => x !== rid);
        drawStrip(); await persist();
      } });
      t && strip.append(t);
    });
  };
  const attach = async (files) => {
    if (!files.length) return;
    if (!entry.id) { entry.html = sanitize(body.innerHTML); const s = await store.saveEntry(entry); history.replaceState(null, '', '#/journal/' + s.id); }
    const b = busy('Encrypting attachments…');
    try {
      for (let i = 0; i < files.length; i++) {
        b.update(`Encrypting ${i + 1} of ${files.length}…`);
        const rec = await store.addMediaFile(files[i], entry.id);
        entry.media = [...(entry.media || []), rec.id];
      }
    } catch (e) { toast(e.message, 'error'); }
    b.done();
    drawStrip();
    await persist();
  };
  drawStrip();

  const updateMoodUI = () => {
    moods.querySelectorAll('.mood').forEach((b, i) => {
      b.classList.toggle('on', MOODS[i].v === entry.mood);
      b.setAttribute('aria-checked', String(MOODS[i].v === entry.mood));
    });
  };

  const tagsWrap = h('section', { class: 'tags-row' });
  const renderTagsBox = () => {
    tagsWrap.innerHTML = '';
    tagsWrap.append(icon('tag', 18, 'muted'), tagInput(entry.tags || [], (t) => { entry.tags = t; touch(); }));
  };
  renderTagsBox();

  // Daily prompt banner for empty/new entries
  let promptBanner = null;
  if (id === 'new' || isEmpty()) {
    let currentPrompt = ai.getDailyReflectionPrompt('auto');
    promptBanner = h('div', { class: 'ai-prompt-banner' },
      h('div', { class: 'ai-prompt-header' },
        h('span', { class: 'row gap-xs' }, icon('bulb', 14), `Daily Inspiration • ${currentPrompt.category}`),
        h('button', {
          class: 'icon-btn small',
          type: 'button',
          title: 'Dismiss inspiration',
          onclick: () => { promptBanner.remove(); promptBanner = null; }
        }, icon('x', 14))
      ),
      h('div', { class: 'ai-prompt-text' }, currentPrompt.prompt),
      h('div', { class: 'ai-prompt-actions' },
        h('button', {
          class: 'btn primary slim',
          type: 'button',
          onclick: () => {
            body.focus();
            document.execCommand('insertHTML', false, currentPrompt.templateHtml);
            touch();
            promptBanner.remove();
            promptBanner = null;
          }
        }, icon('edit', 14), 'Write to this prompt'),
        h('button', {
          class: 'btn ghost slim',
          type: 'button',
          onclick: () => {
            currentPrompt = ai.getDailyReflectionPrompt('auto');
            promptBanner.querySelector('.ai-prompt-header span').lastChild.textContent = `Daily Inspiration • ${currentPrompt.category}`;
            promptBanner.querySelector('.ai-prompt-text').textContent = currentPrompt.prompt;
          }
        }, icon('refresh', 14), 'Shuffle')
      )
    );
  }

  // ---------- Full AI Studio Action Sheet ----------
  const openAiStudio = () => {
    let activeTab = 'writing'; // 'writing' | 'extract' | 'prompts'
    let currentPolishStyle = 'thoughtful';
    let writingResult = '';
    let sheet = null;

    const modalWrap = h('div', { class: 'stack' });

    const renderTabs = () => {
      modalWrap.innerHTML = '';

      // Privacy banner
      const banner = h('div', { class: 'notice ok row gap', style: 'align-items: center; margin-bottom: 4px;' },
        icon('sparkles', 20),
        h('div', { class: 'grow' },
          h('b', { style: 'font-size: 13px;' }, 'Cactus Needle On-Device AI'),
          h('small', { class: 'muted block' }, 'Zero-Knowledge: 100% offline, local on this device. Never uploaded to the cloud.')
        )
      );

      // Tab switcher
      const tabNav = h('div', { class: 'ai-tab-bar' },
        h('button', { class: 'ai-tab-btn' + (activeTab === 'writing' ? ' active' : ''), onclick: () => { activeTab = 'writing'; renderTabs(); } }, '✍️ Writing Studio'),
        h('button', { class: 'ai-tab-btn' + (activeTab === 'extract' ? ' active' : ''), onclick: () => { activeTab = 'extract'; renderTabs(); } }, '⚡ Smart Extract'),
        h('button', { class: 'ai-tab-btn' + (activeTab === 'prompts' ? ' active' : ''), onclick: () => { activeTab = 'prompts'; renderTabs(); } }, '💡 Daily Prompts')
      );

      modalWrap.append(banner, tabNav);

      const rawText = (title.value + '\n' + body.innerText).trim();

      // ----- TAB 1: WRITING STUDIO -----
      if (activeTab === 'writing') {
        const writingPane = h('div', { class: 'stack' });

        // Part A: Bullets to Story
        const bulletsCard = h('div', { class: 'stack-sm' },
          h('b', { style: 'font-size: 14px;' }, 'Expand Bullets into Story'),
          h('p', { class: 'hint', style: 'margin: 0;' }, 'Turns fragmented bullet points or quick notes into a rich, flowing narrative journal entry.'),
          h('div', { class: 'row gap wrap' },
            h('button', {
              class: 'btn primary slim',
              type: 'button',
              onclick: () => {
                const textToExpand = body.innerText.trim() || title.value.trim();
                if (!textToExpand || textToExpand.length < 5) {
                  return toast('Write a few bullet points in your entry first.', 'info');
                }
                writingResult = ai.expandBulletsToStory(textToExpand);
                updateResultBox();
              }
            }, icon('wand', 14), 'Convert Bullets to Story')
          )
        );

        // Part B: Polish Entry
        const polishCard = h('div', { class: 'stack-sm', style: 'border-top: 1px solid var(--line); padding-top: 14px;' },
          h('b', { style: 'font-size: 14px;' }, 'Polish & Refine Style'),
          h('p', { class: 'hint', style: 'margin: 0;' }, 'Elevates tone, cadence, and grammar while strictly preserving all your personal facts.'),
          h('div', { class: 'ai-style-pills' },
            [
              { id: 'thoughtful', label: '🌿 Thoughtful' },
              { id: 'poetic', label: '📜 Poetic' },
              { id: 'concise', label: '⚡ Concise' },
              { id: 'motivated', label: '🔥 Motivated' }
            ].map(st => h('button', {
              class: 'ai-style-pill' + (currentPolishStyle === st.id ? ' active' : ''),
              type: 'button',
              onclick: () => {
                currentPolishStyle = st.id;
                renderTabs();
              }
            }, st.label))
          ),
          h('div', { class: 'row gap wrap' },
            h('button', {
              class: 'btn ghost slim',
              type: 'button',
              onclick: () => {
                const textToPolish = body.innerText.trim();
                if (!textToPolish || textToPolish.length < 8) {
                  return toast('Write some text in the entry to polish.', 'info');
                }
                writingResult = ai.polishJournalEntry(textToPolish, currentPolishStyle);
                updateResultBox();
              }
            }, icon('sparkles', 14), `Polish with ${currentPolishStyle.charAt(0).toUpperCase() + currentPolishStyle.slice(1)} Tone`)
          )
        );

        // Result box container
        const resultContainer = h('div', { class: 'stack-sm', style: 'margin-top: 6px;' });
        const updateResultBox = () => {
          resultContainer.innerHTML = '';
          if (!writingResult) return;

          resultContainer.append(
            h('b', { style: 'font-size: 13px;' }, 'Generated Draft:'),
            h('div', { class: 'ai-diff-box' }, writingResult),
            h('div', { class: 'ai-diff-actions' },
              h('button', {
                class: 'btn primary slim',
                type: 'button',
                onclick: () => {
                  body.focus();
                  const formattedHtml = writingResult.split('\n\n').map(p => `<p>${p}</p>`).join('');
                  document.execCommand('insertHTML', false, formattedHtml);
                  touch();
                  toast('Inserted into entry!', 'success');
                  sheet && sheet.close();
                }
              }, icon('edit', 14), 'Insert into Entry'),
              h('button', {
                class: 'btn ghost slim',
                type: 'button',
                onclick: async () => {
                  if (body.innerText.trim().length > 0) {
                    if (!(await confirmDialog('Replace entire editor content with this generated version?', { ok: 'Replace' }))) return;
                  }
                  const formattedHtml = writingResult.split('\n\n').map(p => `<p>${p}</p>`).join('');
                  body.innerHTML = sanitize(formattedHtml);
                  touch();
                  toast('Editor updated with polished version!', 'success');
                  sheet && sheet.close();
                }
              }, icon('refresh', 14), 'Replace Entire Draft'),
              h('button', {
                class: 'btn ghost slim',
                type: 'button',
                onclick: () => {
                  navigator.clipboard.writeText(writingResult);
                  toast('Copied to clipboard!', 'success');
                }
              }, icon('copy', 14), 'Copy')
            )
          );
        };

        writingPane.append(bulletsCard, polishCard, resultContainer);
        modalWrap.append(writingPane);
      }

      // ----- TAB 2: SMART EXTRACT -----
      if (activeTab === 'extract') {
        if (rawText.length < 5) {
          modalWrap.append(emptyState('wand', 'Entry text needed', 'Write more in your entry first so the engine can extract tasks, mood and tags.'));
          return;
        }

        const detectedMood = ai.detectMood(rawText);
        const suggestedTags = ai.extractRelevantTags(rawText);
        const extractedTasks = ai.extractTasksFromText(rawText);
        const highlights = ai.extractHighlights(rawText);
        const moodObj = MOODS.find(m => m.v === detectedMood);

        const moodSection = h('div', { class: 'stack-sm' },
          h('b', {}, 'Detected Mood & Smart Tags'),
          h('div', { class: 'row gap wrap', style: 'align-items: center; margin: 4px 0;' },
            moodObj ? h('div', { class: 'chip on', style: `--mood: ${moodObj.c};` }, `${moodObj.e} ${moodObj.label}`) : null,
            suggestedTags.map(t => h('span', { class: 'chip' }, '#' + t))
          ),
          h('button', {
            class: 'btn ghost slim',
            style: 'align-self: flex-start; margin-top: 4px;',
            type: 'button',
            onclick: () => {
              if (detectedMood) {
                entry.mood = detectedMood;
                updateMoodUI();
              }
              if (suggestedTags.length) {
                entry.tags = Array.from(new Set([...(entry.tags || []), ...suggestedTags]));
                renderTagsBox();
              }
              touch();
              toast('Mood & tags applied to entry!', 'success');
            }
          }, 'Apply to Entry')
        );

        const tasksSection = h('div', { class: 'stack-sm', style: 'margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line);' },
          h('div', { class: 'row between' },
            h('b', {}, `Extracted Tasks (${extractedTasks.length})`),
            extractedTasks.length ? h('button', {
              class: 'btn primary slim',
              type: 'button',
              onclick: async () => {
                for (const t of extractedTasks) {
                  await store.db.put({
                    type: 'task',
                    title: t.title,
                    notes: 'Extracted by Cactus Needle AI from entry',
                    due: t.due || '',
                    priority: t.priority || 2,
                    repeat: 'none',
                    subtasks: [],
                    remind: t.due ? 1 : 0,
                    tags: t.tags || [],
                    done: false
                  });
                }
                toast(`Created ${extractedTasks.length} task(s)!`, 'success');
                sheet.close();
              }
            }, 'Create All Tasks') : null
          ),
          extractedTasks.length
            ? h('div', { class: 'stack-sm', style: 'margin-top: 6px;' },
                extractedTasks.map(t => h('div', {
                  class: 'row between gap',
                  style: 'padding: 8px 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px;'
                },
                  h('div', { class: 'grow' },
                    h('div', { style: 'font-weight: 600; font-size: 13.5px;' }, t.title),
                    t.due ? h('small', { class: 'muted' }, 'Due: ' + t.due.replace('T', ' at ')) : null
                  ),
                  h('button', {
                    class: 'btn ghost slim',
                    type: 'button',
                    onclick: async (e) => {
                      e.target.disabled = true;
                      await store.db.put({
                        type: 'task',
                        title: t.title,
                        notes: 'Extracted by Cactus Needle AI from entry',
                        due: t.due || '',
                        priority: t.priority || 2,
                        repeat: 'none',
                        subtasks: [],
                        remind: t.due ? 1 : 0,
                        tags: t.tags || [],
                        done: false
                      });
                      e.target.textContent = 'Created ✓';
                      toast('Task created!', 'success');
                    }
                  }, 'Add')
                ))
              )
            : h('p', { class: 'muted', style: 'font-size: 13px;' }, 'No specific action items found in this entry.')
        );

        const highlightsSection = highlights.length ? h('div', { class: 'stack-sm', style: 'margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line);' },
          h('b', {}, 'Key Highlights'),
          h('ul', { style: 'padding-left: 20px; margin: 4px 0; font-size: 13.5px; line-height: 1.6;' },
            highlights.map(hl => h('li', {}, hl))
          )
        ) : null;

        modalWrap.append(moodSection, tasksSection, highlightsSection || h('span'));
      }

      // ----- TAB 3: DAILY PROMPTS -----
      if (activeTab === 'prompts') {
        let selectedCategory = 'auto';
        let currentPrompt = ai.getDailyReflectionPrompt(selectedCategory);

        const promptPane = h('div', { class: 'stack' });

        const categoryFilter = h('div', { class: 'filters', style: 'margin: 0;' },
          [
            { id: 'auto', label: 'Time Aware' },
            { id: 'morning', label: 'Morning' },
            { id: 'afternoon', label: 'Midday' },
            { id: 'evening', label: 'Evening' },
            { id: 'Deep Reflection', label: 'Deep Reflection' }
          ].map(c => h('button', {
            class: 'chip' + (selectedCategory === c.id ? ' on' : ''),
            type: 'button',
            onclick: () => {
              selectedCategory = c.id;
              currentPrompt = ai.getDailyReflectionPrompt(selectedCategory);
              drawPromptCard();
            }
          }, c.label))
        );

        const promptCardWrap = h('div', { class: 'stack-sm' });

        const drawPromptCard = () => {
          promptCardWrap.innerHTML = '';
          const card = h('div', {
            style: 'background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 10px;'
          },
            h('div', { class: 'row between' },
              h('span', { class: 'chip on', style: 'font-size: 12px;' }, currentPrompt.category),
              h('button', {
                class: 'btn ghost slim',
                type: 'button',
                onclick: () => {
                  currentPrompt = ai.getDailyReflectionPrompt(selectedCategory);
                  drawPromptCard();
                }
              }, icon('refresh', 14), 'Shuffle')
            ),
            h('p', { style: 'font-size: 16px; font-weight: 600; line-height: 1.45; margin: 4px 0;' }, currentPrompt.prompt),
            currentPrompt.guidance ? h('small', { class: 'muted' }, `💡 ${currentPrompt.guidance}`) : null,
            currentPrompt.quote ? h('p', { style: 'font-style: italic; font-size: 12.5px; color: var(--muted); border-left: 2px solid var(--ribbon); padding-left: 10px; margin: 4px 0;' }, `“${currentPrompt.quote}”`) : null,
            h('div', { class: 'row gap', style: 'margin-top: 8px;' },
              h('button', {
                class: 'btn primary',
                type: 'button',
                onclick: () => {
                  body.focus();
                  document.execCommand('insertHTML', false, currentPrompt.templateHtml);
                  touch();
                  toast('Prompt inserted into entry!', 'success');
                  sheet.close();
                }
              }, icon('edit', 15), 'Insert into Editor')
            )
          );
          promptCardWrap.append(card);
        };

        drawPromptCard();
        promptPane.append(categoryFilter, promptCardWrap);
        modalWrap.append(promptPane);
      }
    };

    renderTabs();
    sheet = openSheet(modalWrap, { title: 'AI Assistant Studio', wide: true });
  };

  root.append(h('div', { class: 'editor' },
    h('div', { class: 'editor-bar' },
      h('a', { class: 'icon-btn', href: '#/journal', 'aria-label': 'Back to journal', onclick: () => save.flush() }, icon('left')),
      dateInput, timeInput, h('span', { class: 'grow' }),
      iconBtn('sparkles', 'AI Studio', openAiStudio, 'ai-glow'),
      status, favBtn, delBtn),
    h('article', { class: 'page' },
      title,
      moods,
      toolbar,
      colorBarWrap,
      promptBanner || h('span'),
      body,
      h('section', { class: 'attach' },
        strip,
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn ghost', type: 'button', onclick: async () => attach(await pickFile('*/*', true)) }, icon('clip'), 'Add files'),
          h('button', { class: 'btn ghost', type: 'button', onclick: async () => attach(await pickFile('image/*,video/*', true)) }, icon('camera'), 'Photo or video'),
          h('button', { class: 'btn ghost', type: 'button', onclick: async () => { const f = await recordVoice(); if (f) attach([f]); } }, icon('mic'), 'Voice note'),
          h('button', { class: 'btn ai-glow-btn', type: 'button', onclick: openAiStudio }, icon('sparkles'), 'AI Studio'))),
      tagsWrap)
  ));

  // Drop files onto the page
  const page = root.querySelector('.page');
  page.addEventListener('dragover', (e) => { e.preventDefault(); page.classList.add('drop'); });
  page.addEventListener('dragleave', () => page.classList.remove('drop'));
  page.addEventListener('drop', (e) => { e.preventDefault(); page.classList.remove('drop'); attach(Array.from(e.dataTransfer.files)); });

  if (id === 'new') setTimeout(() => (matchMedia('(pointer:coarse)').matches ? null : title.focus()), 50);
  return () => save.flush(); // cleanup: save when leaving
}
