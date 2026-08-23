import joplin from 'api';
import { MenuItemLocation } from 'api/types';

joplin.plugins.register({
    onStart: async () => {
        const panel = await joplin.views.panels.create('published_notes_panel');

        function getFolderPath(folderId: string, folderMap: Map<string, any>): string {
            const path: string[] = [];
            let currentId = folderId;
            while (currentId && folderMap.has(currentId)) {
                const folder = folderMap.get(currentId);
                path.unshift(folder.title || 'Untitled Notebook');
                currentId = folder.parent_id;
            }
            return path.length > 0 ? path.join(' / ') : 'No Notebook';
        }

        async function fetchPublishedNotes() {
            const sharedFolderIds = new Set<string>();
            const folderMap = new Map<string, any>();
            let folderPage = 1;
            let folderHasMore = true;

            // Mappa tutti i taccuini e identifica quelli condivisi
            while (folderHasMore) {
                const res = await joplin.data.get(['folders'], {
                    fields: ['id', 'title', 'parent_id', 'share_id'],
                    page: folderPage++
                });
                for (const f of res.items) {
                    folderMap.set(f.id, f);
                    if (f.share_id && f.share_id.trim() !== '') sharedFolderIds.add(f.id);
                }
                folderHasMore = res.has_more;
            }

            // Propaga la proprietà "condivisa" a tutti i sottotaccuini
            for (const [id, folder] of folderMap.entries()) {
                let curr = folder;
                while (curr && curr.parent_id) {
                    const parent = folderMap.get(curr.parent_id);
                    if (parent && (parent.share_id || sharedFolderIds.has(parent.id))) {
                        sharedFolderIds.add(id);
                        break;
                    }
                    curr = parent;
                }
            }

            const directNotes = [];
            const inheritedNotes = [];
            let notePage = 1;
            let noteHasMore = true;

            // Suddivide le note condivise in due array
            while (noteHasMore) {
                const res = await joplin.data.get(['notes'], {
                    fields: ['id', 'title', 'parent_id', 'is_shared', 'user_updated_time', 'updated_time'],
                    page: notePage++
                });

                for (const note of res.items) {
                    if (note.is_shared === 1) {
                        const updatedTime = note.user_updated_time || note.updated_time || 0;
                        const fullFolderPath = getFolderPath(note.parent_id, folderMap);
                        const noteObj = {
                            id: note.id,
                            title: note.title || 'Untitled',
                            folderPath: fullFolderPath,
                            updatedTime: updatedTime
                        };

                        if (sharedFolderIds.has(note.parent_id)) {
                            inheritedNotes.push(noteObj);
                        } else {
                            directNotes.push(noteObj);
                        }
                    }
                }
                noteHasMore = res.has_more;
            }

            return { directNotes, inheritedNotes };
        }

        function escapeHtml(text: string) {
            return (text || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }

        async function renderPanel() {
            await joplin.views.panels.setHtml(panel, '<div style="padding: 12px; color: var(--joplin-color);">Loading published notes...</div>');

            const { directNotes, inheritedNotes } = await fetchPublishedNotes();
            directNotes.sort((a, b) => b.updatedTime - a.updatedTime);
            inheritedNotes.sort((a, b) => b.updatedTime - a.updatedTime);

            function renderNoteList(noteArr: any[]) {
                if (noteArr.length === 0) {
                    return '<li style="font-size: 13px; color: var(--joplin-color3); padding: 10px; text-align: center;">No notes found in this section.</li>';
                }
                return noteArr.map(n => {
                    const d = n.updatedTime ? new Date(n.updatedTime).toLocaleDateString() : '';
                    return `
                        <li class="note-item" data-title="${escapeHtml(n.title.toLowerCase())}" data-folder="${escapeHtml(n.folderPath.toLowerCase())}" data-date="${n.updatedTime}"
                            style="margin-bottom: 12px; font-size: 13px; background: var(--joplin-background-color); border: 1px solid var(--joplin-divider-color); border-radius: 6px; padding: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                                <a href="#" onclick="webviewApi.postMessage({ name: 'openNote', id: '${n.id}' }); return false;"
                                   style="color: var(--joplin-color); text-decoration: none; font-weight: 600; font-size: 14px; flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                    📄 ${escapeHtml(n.title)}
                                </a>
                                <button onclick="webviewApi.postMessage({ name: 'unshareNote', noteId: '${n.id}' })"
                                        style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; flex-shrink: 0; font-weight: bold;">
                                    Unshare
                                </button>
                            </div>
                            <div style="font-size: 11px; color: var(--joplin-color3); margin-top: 6px;">📂 ${escapeHtml(n.folderPath)} • 🕒 ${d}</div>
                        </li>
                    `;
                }).join('');
            }

            const totalNotes = directNotes.length + inheritedNotes.length;

            const html = `
                <style>
                    .panel-container { height: 100vh; display: flex; flex-direction: column; padding: 12px; box-sizing: border-box; color: var(--joplin-color); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: var(--joplin-background-color); }
                    .panel-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; margin-bottom: 12px; flex-shrink: 0; border-bottom: 1px solid var(--joplin-divider-color); }
                    .panel-controls { margin-bottom: 12px; display: flex; gap: 8px; flex-shrink: 0; }
                    .panel-scroll-area { overflow-y: auto; flex-grow: 1; padding-right: 4px; }
                    select#sortFilter, select#sortFilter option { background-color: var(--joplin-background-color, #2d3136) !important; color: var(--joplin-color, #ffffff) !important; }
                    ::-webkit-scrollbar { width: 6px; height: 6px; }
                    ::-webkit-scrollbar-track { background: transparent; }
                    ::-webkit-scrollbar-thumb { background: var(--joplin-divider-color, #555); border-radius: 3px; }
                    ::-webkit-scrollbar-thumb:hover { background: var(--joplin-color3, #888); }
                    details summary { cursor: pointer; font-weight: bold; font-size: 13px; padding: 6px 0; border-bottom: 1px dashed var(--joplin-divider-color); margin-bottom: 8px; outline: none; user-select: none; }
                </style>

                <div class="panel-container">
                    <div class="panel-header">
                        <h3 style="margin: 0; font-size: 15px; font-weight: 600;">Shared Notes (<span id="totalCount">${totalNotes}</span>)</h3>
                        <button onclick="webviewApi.postMessage({ name: 'refresh' })" title="Refresh list" style="padding: 4px 8px; cursor: pointer; border-radius: 4px; border: 1px solid var(--joplin-divider-color); background: transparent; color: inherit; font-size: 12px;">🔄 Refresh</button>
                    </div>

                    <div class="panel-controls">
                        <input type="text" id="searchInput" placeholder="Search title or path..." oninput="window.updatePanel()" style="flex: 2; box-sizing: border-box; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--joplin-divider-color); background: transparent; color: var(--joplin-color); font-size: 12px; outline: none;" />
                        <select id="sortFilter" onchange="window.updatePanel()" style="flex: 1; box-sizing: border-box; padding: 6px; border-radius: 4px; border: 1px solid var(--joplin-divider-color); font-size: 12px; outline: none;">
                            <option value="date-desc">Newest</option><option value="date-asc">Oldest</option><option value="title-asc">Title (A-Z)</option><option value="title-desc">Title (Z-A)</option>
                        </select>
                    </div>

                    <div class="panel-scroll-area">
                        <details open>
                            <summary>🌐 Direct Shares (${directNotes.length})</summary>
                            <ul class="publishedList" style="list-style: none; padding-left: 0; margin: 0;">${renderNoteList(directNotes)}</ul>
                        </details>
                        
                        <details open style="margin-top: 10px;">
                            <summary>📁 In Shared Notebooks (${inheritedNotes.length})</summary>
                            <ul class="publishedList" style="list-style: none; padding-left: 0; margin: 0;">${renderNoteList(inheritedNotes)}</ul>
                        </details>
                    </div>
                </div>

                <img src="invalid_img" style="display:none;" onerror="
                    window.updatePanel = function() {
                        var search = (document.getElementById('searchInput').value || '').toLowerCase().trim();
                        var sort = document.getElementById('sortFilter').value;
                        var lists = document.querySelectorAll('.publishedList');
                        var totalVisibleCount = 0;

                        lists.forEach(function(list) {
                            var items = Array.from(list.querySelectorAll('.note-item'));
                            items.forEach(function(item) {
                                var title = item.getAttribute('data-title') || '';
                                var folder = item.getAttribute('data-folder') || '';
                                if (!search || title.includes(search) || folder.includes(search)) {
                                    item.style.display = ''; totalVisibleCount++;
                                } else { item.style.display = 'none'; }
                            });

                            items.sort(function(a, b) {
                                if (sort === 'title-asc') return (a.getAttribute('data-title') || '').localeCompare(b.getAttribute('data-title') || '');
                                if (sort === 'title-desc') return (b.getAttribute('data-title') || '').localeCompare(a.getAttribute('data-title') || '');
                                if (sort === 'date-desc') return Number(b.getAttribute('data-date') || 0) - Number(a.getAttribute('data-date') || 0);
                                return Number(a.getAttribute('data-date') || 0) - Number(b.getAttribute('data-date') || 0);
                            });
                            items.forEach(function(item) { list.appendChild(item); });
                        });

                        var totalBadge = document.getElementById('totalCount');
                        if (totalBadge) totalBadge.innerText = totalVisibleCount;
                    };
                    window.updatePanel();
                " />
            `;
            await joplin.views.panels.setHtml(panel, html);
        }

        await joplin.views.panels.onMessage(panel, async (message: any) => {
            if (message.name === 'openNote') {
                await joplin.commands.execute('openNote', message.id);
            } else if (message.name === 'refresh') {
                await renderPanel();
            } else if (message.name === 'unshareNote') {
                await joplin.data.put(['notes', message.noteId], null, { is_shared: 0 });
                await renderPanel();
            }
        });

        await joplin.commands.register({
            name: 'togglePublishedNotesPanel',
            label: 'Toggle Published Notes Panel',
            iconName: 'fas fa-share-alt',
            execute: async () => {
                const isVisible = await joplin.views.panels.visible(panel);
                await joplin.views.panels.show(panel, !isVisible);
            },
        });

        await joplin.views.menuItems.create(
            'togglePublishedNotesPanelMenuItem',
            'togglePublishedNotesPanel',
            MenuItemLocation.View
        );

        await renderPanel();
    },
});