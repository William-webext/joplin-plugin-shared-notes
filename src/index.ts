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

        async function renderPanel() {
            await joplin.views.panels.setHtml(
                panel, 
                '<div style="padding: 10px; font-family: sans-serif; color: var(--joplin-color);">Loading shared notes...</div>'
            );
            
            const notes = await fetchSharedNotes();

            const html = `
                <div style="padding: 12px; font-family: sans-serif; color: var(--joplin-color);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h3 style="margin: 0; font-size: 14px;">👥 Shared Notes (${notes.length})</h3>
                        <button id="refreshBtn" title="Refresh" style="padding: 3px 8px; cursor: pointer; border-radius: 4px; border: 1px solid var(--joplin-divider-color, #ccc); background: transparent; color: inherit;">🔄</button>
                    </div>

                    <!-- Filter & Sort Controls -->
                    <div style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
                        <input type="text" id="searchInput" placeholder="Search (e.g. pi)..." 
                            style="width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--joplin-divider-color, #ccc); background: var(--joplin-background-color, #fff); color: var(--joplin-color); font-size: 12px;" />
                        
                        <div style="display: flex; gap: 6px;">
                            <select id="typeFilter" 
                                style="flex: 1; box-sizing: border-box; padding: 5px 6px; border-radius: 4px; border: 1px solid var(--joplin-divider-color, #ccc); background: var(--joplin-background-color, #fff); color: var(--joplin-color); font-size: 11px;">
                                <option value="all">All Shared</option>
                                <option value="users">👥 Users</option>
                                <option value="public">🌐 Public Link</option>
                            </select>

                            <select id="sortFilter" 
                                style="flex: 1; box-sizing: border-box; padding: 5px 6px; border-radius: 4px; border: 1px solid var(--joplin-divider-color, #ccc); background: var(--joplin-background-color, #fff); color: var(--joplin-color); font-size: 11px;">
                                <option value="title-asc">Title (A-Z)</option>
                                <option value="title-desc">Title (Z-A)</option>
                                <option value="date-desc">Date (Newest)</option>
                                <option value="date-asc">Date (Oldest)</option>
                            </select>
                        </div>
                    </div>

                    <ul id="notesList" style="list-style: none; padding-left: 0; margin: 0;"></ul>
                </div>

                <script>
                    const notesData = ${JSON.stringify(notes).replace(/</g, '\\u003c')};

                    function escapeHtml(text) {
                        return (text || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
                    }

                    function updateList() {
                        const search = (document.getElementById('searchInput').value || '').toLowerCase().trim();
                        const type = document.getElementById('typeFilter').value;
                        const sort = document.getElementById('sortFilter').value;

                        // 1. Corrispondenza parziale e filtro tipo
                        let filtered = notesData.filter(n => {
                            const matchesSearch = !search || 
                                n.title.toLowerCase().includes(search) || 
                                n.folderTitle.toLowerCase().includes(search);
                            const matchesType = type === 'all' || n.shareType === type;
                            return matchesSearch && matchesType;
                        });

                        // 2. Ordinamento
                        filtered.sort((a, b) => {
                            if (sort === 'title-asc') return a.title.localeCompare(b.title);
                            if (sort === 'title-desc') return b.title.localeCompare(a.title);
                            if (sort === 'date-desc') return b.updatedTime - a.updatedTime;
                            if (sort === 'date-asc') return a.updatedTime - b.updatedTime;
                            return 0;
                        });

                        // 3. Render
                        const ul = document.getElementById('notesList');
                        if (filtered.length === 0) {
                            ul.innerHTML = '<li style="font-size: 13px; color: #888; padding: 8px 0;">No matching notes found.</li>';
                            return;
                        }

                        ul.innerHTML = filtered.map(n => {
                            let dateStr = '';
                            if (n.updatedTime) {
                                const d = new Date(n.updatedTime);
                                dateStr = ' • 🕒 ' + d.toLocaleDateString();
                            }
                            return \`
                                <li style="margin-bottom: 10px; font-size: 13px; border-bottom: 1px dashed var(--joplin-divider-color, #444); padding-bottom: 6px;">
                                    <a href="#" onclick="webviewApi.postMessage({ name: 'openNote', id: '\${n.id}' }); return false;" 
                                       style="color: var(--joplin-url-color, #4a90e2); text-decoration: none; font-weight: bold;">
                                        📄 \${escapeHtml(n.title)}
                                    </a>
                                    <div style="font-size: 11px; color: var(--joplin-color3, #888); margin-top: 3px;">
                                        📂 \${escapeHtml(n.folderTitle)}\${dateStr}
                                    </div>
                                    <div style="font-size: 10px; margin-top: 3px;">
                                        <span style="background: rgba(127,127,127,0.15); padding: 2px 6px; border-radius: 3px; font-weight: 500;">
                                            \${escapeHtml(n.shareLabel)}
                                        </span>
                                    </div>
                                </li>
                            \`;
                        }).join('');
                    }

                    document.getElementById('searchInput').addEventListener('input', updateList);
                    document.getElementById('typeFilter').addEventListener('change', updateList);
                    document.getElementById('sortFilter').addEventListener('change', updateList);
                    document.getElementById('refreshBtn').addEventListener('click', () => {
                        webviewApi.postMessage({ name: 'refresh' });
                    });

                    updateList();
                </script>
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