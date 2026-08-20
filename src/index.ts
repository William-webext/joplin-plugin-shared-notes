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
                        const shareLabel = isPublic ? '🌐 Public Link' : '👥 Specific User(s)';
                        const updatedTime = note.user_updated_time || note.updated_time || 0;

                        sharedNotesMap.set(note.id, {
                            id: note.id,
                            title: note.title || 'Untitled',
                            folderTitle: folder ? folder.title : 'Unknown',
                            shareType: shareType,
                            shareLabel: shareLabel,
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

            // Ordinamento iniziale predefinito per data decrescente
            notes.sort((a, b) => b.updatedTime - a.updatedTime);

            let itemsHtml = notes.map(n => {
                let dateStr = '';
                if (n.updatedTime) {
                    const d = new Date(n.updatedTime);
                    dateStr = ' • 🕒 ' + d.toLocaleDateString();
                }

                return `
                    <li class="note-item" 
                        data-title="${escapeHtml(n.title.toLowerCase())}" 
                        data-folder="${escapeHtml(n.folderTitle.toLowerCase())}" 
                        data-type="${n.shareType}" 
                        data-date="${n.updatedTime}"
                        style="margin-bottom: 10px; font-size: 13px; border-bottom: 1px dashed var(--joplin-divider-color, #444); padding-bottom: 6px;">
                        <a href="#" onclick="webviewApi.postMessage({ name: 'openNote', id: '${n.id}' }); return false;" 
                           style="color: var(--joplin-url-color, #4a90e2); text-decoration: none; font-weight: bold; display: block; margin-bottom: 3px;">
                            📄 ${escapeHtml(n.title)}
                        </a>
                        <div style="font-size: 11px; color: var(--joplin-color3, #888); margin-bottom: 3px;">
                            📂 ${escapeHtml(n.folderTitle)}${dateStr}
                        </div>
                        <div style="font-size: 10px;">
                            <span style="background: rgba(127,127,127,0.15); padding: 2px 6px; border-radius: 3px; font-weight: 500;">
                                ${escapeHtml(n.shareLabel)}
                            </span>
                        </div>
                    </li>
                `;
            }).join('');

            if (notes.length === 0) {
                itemsHtml = '<li style="font-size: 13px; color: #888; padding: 8px 0;">No shared notes found.</li>';
            }

            const html = `
                <div style="padding: 12px; font-family: sans-serif; color: var(--joplin-color); display: flex; flex-direction: column; box-sizing: border-box;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h3 style="margin: 0; font-size: 14px;">👥 Shared (<span id="countBadge">${notes.length}</span>)</h3>
                        <button onclick="webviewApi.postMessage({ name: 'refresh' })" title="Refresh" style="padding: 3px 8px; cursor: pointer; border-radius: 4px; border: 1px solid var(--joplin-divider-color, #ccc); background: transparent; color: inherit;">🔄</button>
                    </div>

                    <!-- Filter & Sort Controls -->
                    <div style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
                        <input type="text" id="searchInput" placeholder="Search (e.g. pippo)..." 
                            oninput="window.updatePanel && window.updatePanel()"
                            style="width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--joplin-divider-color, #ccc); background: var(--joplin-background-color, #fff); color: var(--joplin-color); font-size: 12px;" />
                        
                        <div style="display: flex; gap: 6px;">
                            <select id="typeFilter" onchange="window.updatePanel && window.updatePanel()"
                                style="flex: 1; box-sizing: border-box; padding: 5px 6px; border-radius: 4px; border: 1px solid var(--joplin-divider-color, #ccc); background: var(--joplin-background-color, #fff); color: var(--joplin-color); font-size: 11px;">
                                <option value="all">All Shared</option>
                                <option value="users">👥 Users</option>
                                <option value="public">🌐 Public Link</option>
                            </select>

                            <select id="sortFilter" onchange="window.updatePanel && window.updatePanel()"
                                style="flex: 1; box-sizing: border-box; padding: 5px 6px; border-radius: 4px; border: 1px solid var(--joplin-divider-color, #ccc); background: var(--joplin-background-color, #fff); color: var(--joplin-color); font-size: 11px;">
                                <option value="date-desc">Date (Newest)</option>
                                <option value="date-asc">Date (Oldest)</option>
                                <option value="title-asc">Title (A-Z)</option>
                                <option value="title-desc">Title (Z-A)</option>
                            </select>
                        </div>
                    </div>

                    <div style="overflow-y: auto; flex: 1;">
                        <ul id="notesList" style="list-style: none; padding-left: 0; margin: 0;">
                            ${itemsHtml}
                        </ul>
                    </div>
                </div>

                <img src="invalid_img" style="display:none;" onerror="
                    window.updatePanel = function() {
                        var search = (document.getElementById('searchInput').value || '').toLowerCase().trim();
                        var type = document.getElementById('typeFilter').value;
                        var sort = document.getElementById('sortFilter').value;
                        var list = document.getElementById('notesList');
                        var items = Array.from(list.querySelectorAll('.note-item'));

                        var visibleCount = 0;
                        items.forEach(function(item) {
                            var title = item.getAttribute('data-title') || '';
                            var folder = item.getAttribute('data-folder') || '';
                            var itemType = item.getAttribute('data-type') || '';

                            var matchesSearch = !search || title.includes(search) || folder.includes(search);
                            var matchesType = (type === 'all') || (itemType === type);

                            if (matchesSearch && matchesType) {
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
                        document.getElementById('countBadge').innerText = visibleCount;
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