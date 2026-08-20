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
                    fields: ['id', 'title', 'parent_id', 'is_shared'],
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

                        sharedNotesMap.set(note.id, {
                            id: note.id,
                            title: note.title || 'Untitled',
                            folderTitle: folder ? folder.title : 'Unknown',
                            shareType: shareType,
                            shareLabel: shareLabel
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

            let itemsHtml = notes.map(n => `
                <li class="note-item" data-type="${n.shareType}" data-search="${escapeHtml((n.title + ' ' + n.folderTitle).toLowerCase())}" style="margin-bottom: 10px; font-size: 13px; border-bottom: 1px dashed var(--joplin-divider-color, #444); padding-bottom: 6px;">
                    <a href="#" onclick="webviewApi.postMessage({ name: 'openNote', id: '${n.id}' }); return false;" 
                       style="color: var(--joplin-url-color, #4a90e2); text-decoration: none; font-weight: bold;">
                        📄 ${escapeHtml(n.title)}
                    </a>
                    <div style="font-size: 11px; color: var(--joplin-color3, #888); margin-top: 3px;">
                        📂 ${escapeHtml(n.folderTitle)}
                    </div>
                    <div style="font-size: 10px; margin-top: 3px;">
                        <span style="background: rgba(127,127,127,0.15); padding: 2px 6px; border-radius: 3px; font-weight: 500;">
                            ${escapeHtml(n.shareLabel)}
                        </span>
                    </div>
                </li>
            `).join('');

            if (notes.length === 0) {
                itemsHtml = '<li style="font-size: 13px; color: #888;">No shared notes found.</li>';
            } else {
                itemsHtml += '<li id="no-results" style="font-size: 13px; color: #888; display: none; padding: 8px 0;">No matching notes found.</li>';
            }

            const html = `
                <div style="padding: 12px; font-family: sans-serif; color: var(--joplin-color);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h3 style="margin: 0; font-size: 14px;">👥 Shared Notes (${notes.length})</h3>
                        <button onclick="webviewApi.postMessage({ name: 'refresh' })" title="Refresh" style="padding: 3px 8px; cursor: pointer; border-radius: 4px; border: 1px solid var(--joplin-divider-color, #ccc); background: transparent; color: inherit;">🔄</button>
                    </div>

                    <!-- Search and Filter Bar -->
                    <div style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
                        <input type="text" id="searchInput" placeholder="Search note or notebook..." 
                            style="width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--joplin-divider-color, #ccc); background: var(--joplin-background-color, #fff); color: var(--joplin-color); font-size: 12px;"
                            oninput="filterNotes()" />
                        
                        <select id="typeFilter" onchange="filterNotes()" 
                            style="width: 100%; box-sizing: border-box; padding: 5px 6px; border-radius: 4px; border: 1px solid var(--joplin-divider-color, #ccc); background: var(--joplin-background-color, #fff); color: var(--joplin-color); font-size: 12px;">
                            <option value="all">All Shared Types</option>
                            <option value="users">👥 Specific User(s)</option>
                            <option value="public">🌐 Public Link</option>
                        </select>
                    </div>

                    <ul id="notesList" style="list-style: none; padding-left: 0; margin: 0;">
                        ${itemsHtml}
                    </ul>
                </div>

                <script>
                    function filterNotes() {
                        const searchText = document.getElementById('searchInput').value.toLowerCase().trim();
                        const filterType = document.getElementById('typeFilter').value;
                        const items = document.querySelectorAll('.note-item');
                        let visibleCount = 0;

                        items.forEach(item => {
                            const searchData = item.getAttribute('data-search') || '';
                            const itemType = item.getAttribute('data-type');

                            const matchesSearch = searchText === '' || searchData.includes(searchText);
                            const matchesType = filterType === 'all' || itemType === filterType;

                            if (matchesSearch && matchesType) {
                                item.style.display = '';
                                visibleCount++;
                            } else {
                                item.style.display = 'none';
                            }
                        });

                        const noResults = document.getElementById('no-results');
                        if (noResults) {
                            noResults.style.display = (visibleCount === 0 && items.length > 0) ? 'block' : 'none';
                        }
                    }
                </script>
            `;

            await joplin.views.panels.setHtml(panel, html);
        }

        function escapeHtml(text: string) {
            return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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