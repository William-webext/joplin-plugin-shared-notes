import joplin from 'api';
import { MenuItemLocation } from 'api/types';

joplin.plugins.register({
    onStart: async () => {
        const panel = await joplin.views.panels.create('shared_notes_panel');

        async function fetchSharedNotes() {
            const allFolders: any[] = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const res = await joplin.data.get(['folders'], {
                    fields: ['id', 'title', 'parent_id', 'share_id'],
                    page: page++,
                });
                allFolders.push(...res.items);
                hasMore = res.has_more;
            }

            const folderMap = new Map(allFolders.map(f => [f.id, f]));

            function isSharedFolder(folder: any): boolean {
                if (!folder) return false;
                if (folder.share_id && folder.share_id.trim() !== '') return true;
                if (folder.parent_id) return isSharedFolder(folderMap.get(folder.parent_id));
                return false;
            }

            const sharedFolderIds = new Set(allFolders.filter(f => isSharedFolder(f)).map(f => f.id));

            const publicNoteIds = new Set<string>();
            try {
                const sharesRes = await joplin.data.get(['shares']);
                if (sharesRes && sharesRes.items) {
                    sharesRes.items.forEach((s: any) => {
                        if (s.note_id) publicNoteIds.add(s.note_id);
                        if (s.folder_id) sharedFolderIds.add(s.folder_id);
                    });
                }
            } catch (e) {
                // Endpoint shares non disponibile o vuoto
            }

            const sharedNotesMap = new Map<string, any>();
            let notePage = 1;
            let noteHasMore = true;

            while (noteHasMore) {
                const res = await joplin.data.get(['notes'], {
                    fields: ['id', 'title', 'parent_id', 'is_shared', 'user_updated_time', 'updated_time'],
                    page: notePage++,
                });

                for (const note of res.items) {
                    const folder = folderMap.get(note.parent_id);
                    const belongsToSharedFolder = sharedFolderIds.has(note.parent_id);
                    const isIndividuallyShared = publicNoteIds.has(note.id) || note.is_shared === 1;

                    if (belongsToSharedFolder || isIndividuallyShared) {
                        const isPublic = isIndividuallyShared || publicNoteIds.has(note.id);
                        const shareType = isPublic ? 'public' : 'users';
                        const updatedTime = note.user_updated_time || note.updated_time || 0;

                        sharedNotesMap.set(note.id, {
                            id: note.id,
                            title: note.title || 'Untitled',
                            folderTitle: folder ? folder.title : 'Unknown',
                            shareType: shareType,
                            updatedTime: updatedTime
                        });
                    }
                }
                noteHasMore = res.has_more;
            }

            return Array.from(sharedNotesMap.values());
        }

        function escapeHtml(text: string) {
            return (text || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }

        async function renderPanel() {
            await joplin.views.panels.setHtml(
                panel, 
                '<div style="padding: 10px; font-family: sans-serif; color: var(--joplin-color);">Loading shared notes...</div>'
            );
            
            const notes = await fetchSharedNotes();

            // Ordinamento predefinito: note più recenti
            notes.sort((a, b) => b.updatedTime - a.updatedTime);

            const usersNotes = notes.filter(n => n.shareType === 'users');
            const publicNotes = notes.filter(n => n.shareType === 'public');

            function renderNoteList(noteArr: any[]) {
                if (noteArr.length === 0) {
                    return '<li class="no-notes" style="font-size: 12px; color: #888; padding: 4px 0;">No notes found.</li>';
                }

                return noteArr.map(n => {
                    let dateStr = '';
                    if (n.updatedTime) {
                        const d = new Date(n.updatedTime);
                        dateStr = ' • 🕒 ' + d.toLocaleDateString();
                    }

                    return `
                        <li class="note-item" 
                            data-title="${escapeHtml(n.title.toLowerCase())}" 
                            data-folder="${escapeHtml(n.folderTitle.toLowerCase())}" 
                            data-date="${n.updatedTime}"
                            style="margin-bottom: 6px; font-size: 13px; border-bottom: 1px dashed var(--joplin-divider-color, #444); padding-bottom: 4px;">
                            <a href="#" onclick="webviewApi.postMessage({ name: 'openNote', id: '${n.id}' }); return false;" 
                               style="color: var(--joplin-url-color, #4a90e2); text-decoration: none; font-weight: bold; display: block; margin-bottom: 2px;">
                                📄 ${escapeHtml(n.title)}
                            </a>
                            <div style="font-size: 11px; color: var(--joplin-color3, #888);">
                                📂 ${escapeHtml(n.folderTitle)}${dateStr}
                            </div>
                        </li>
                    `;
                }).join('');
            }

            const html = `
                <div style="padding: 12px; font-family: sans-serif; color: var(--joplin-color); box-sizing: border-box;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h3 style="margin: 0; font-size: 14px;">👥 Shared Notes (${notes.length})</h3>
                        <button onclick="webviewApi.postMessage({ name: 'refresh' })" title="Refresh" style="padding: 3px 8px; cursor: pointer; border-radius: 4px; border: 1px solid var(--joplin-divider-color, #ccc); background: transparent; color: inherit;">🔄</button>
                    </div>

                    <!-- Search & Sort Controls -->
                    <div style="margin-bottom: 12px; display: flex; gap: 6px;">
                        <input type="text" id="searchInput" placeholder="Search (e.g. pippo)..." 
                            oninput="window.updatePanel && window.updatePanel()"
                            style="flex: 2; box-sizing: border-box; padding: 5px 8px; border-radius: 4px; border: 1px solid var(--joplin-divider-color, #ccc); background: var(--joplin-background-color, #fff); color: var(--joplin-color); font-size: 11px;" />
                        
                        <select id="sortFilter" onchange="window.updatePanel && window.updatePanel()"
                            style="flex: 1; box-sizing: border-box; padding: 5px 4px; border-radius: 4px; border: 1px solid var(--joplin-divider-color, #ccc); background: var(--joplin-background-color, #fff); color: var(--joplin-color); font-size: 11px;">
                            <option value="date-desc">Date (Newest)</option>
                            <option value="date-asc">Date (Oldest)</option>
                            <option value="title-asc">Title (A-Z)</option>
                            <option value="title-desc">Title (Z-A)</option>
                        </select>
                    </div>

                    <!-- Collapsible Sections -->
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <!-- Section 1: Specific Users -->
                        <details open style="border: 1px solid var(--joplin-divider-color, #444); border-radius: 4px; padding: 6px 8px; background: rgba(127,127,127,0.05);">
                            <summary style="cursor: pointer; font-weight: bold; font-size: 12px; user-select: none;">
                                👥 Specific User(s) (<span id="usersCount">${usersNotes.length}</span>)
                            </summary>
                            <ul id="usersList" style="list-style: none; padding-left: 0; margin: 8px 0 0 0;">
                                ${renderNoteList(usersNotes)}
                            </ul>
                        </details>

                        <!-- Section 2: Public Links -->
                        <details open style="border: 1px solid var(--joplin-divider-color, #444); border-radius: 4px; padding: 6px 8px; background: rgba(127,127,127,0.05);">
                            <summary style="cursor: pointer; font-weight: bold; font-size: 12px; user-select: none;">
                                🌐 Public Link (<span id="publicCount">${publicNotes.length}</span>)
                            </summary>
                            <ul id="publicList" style="list-style: none; padding-left: 0; margin: 8px 0 0 0;">
                                ${renderNoteList(publicNotes)}
                            </ul>
                        </details>
                    </div>
                </div>

                <img src="invalid_img" style="display:none;" onerror="
                    window.updatePanel = function() {
                        var search = (document.getElementById('searchInput').value || '').toLowerCase().trim();
                        var sort = document.getElementById('sortFilter').value;

                        ['usersList', 'publicList'].forEach(function(listId) {
                            var list = document.getElementById(listId);
                            if (!list) return;

                            var items = Array.from(list.querySelectorAll('.note-item'));
                            var visibleCount = 0;

                            items.forEach(function(item) {
                                var title = item.getAttribute('data-title') || '';
                                var folder = item.getAttribute('data-folder') || '';

                                var matchesSearch = !search || title.includes(search) || folder.includes(search);

                                if (matchesSearch) {
                                    item.style.display = '';
                                    visibleCount++;
                                } else {
                                    item.style.display = 'none';
                                }
                            });

                            items.sort(function(a, b) {
                                if (sort === 'title-asc') return (a.getAttribute('data-title') || '').localeCompare(b.getAttribute('data-title') || '');
                                if (sort === 'title-desc') return (b.getAttribute('data-title') || '').localeCompare(a.getAttribute('data-title') || '');
                                if (sort === 'date-desc') return Number(b.getAttribute('data-date') || 0) - Number(a.getAttribute('data-date') || 0);
                                if (sort === 'date-asc') return Number(a.getAttribute('data-date') || 0) - Number(b.getAttribute('data-date') || 0);
                                return 0;
                            });

                            items.forEach(function(item) { list.appendChild(item); });

                            var countBadgeId = (listId === 'usersList') ? 'usersCount' : 'publicCount';
                            var badge = document.getElementById(countBadgeId);
                            if (badge) badge.innerText = visibleCount;
                        });
                    };
                    window.updatePanel();
                " />
            `;

            await joplin.views.panels.setHtml(panel, html);
        }

        await joplin.commands.register({
            name: 'toggleSharedNotesPanel',
            label: 'Toggle Shared Notes Panel',
            iconName: 'fas fa-share-alt',
            execute: async () => {
                const isVisible = await joplin.views.panels.visible(panel);
                await joplin.views.panels.show(panel, !isVisible);
            },
        });

        await joplin.views.menuItems.create(
            'toggleSharedNotesPanelMenuItem',
            'toggleSharedNotesPanel',
            MenuItemLocation.View
        );

        await joplin.views.panels.onMessage(panel, async (message: any) => {
            if (message.name === 'openNote') {
                await joplin.commands.execute('openNote', message.id);
            } else if (message.name === 'refresh') {
                await renderPanel();
            }
        });

        await renderPanel();
    },
});