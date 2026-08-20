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

            let publicNoteIds = new Set<string>();
            try {
                const sharesRes = await joplin.data.get(['shares']);
                if (sharesRes && sharesRes.items) {
                    sharesRes.items.forEach((s: any) => {
                        if (s.note_id) publicNoteIds.add(s.note_id);
                    });
                }
            } catch (e) {
                // Endpoint shares non disponibile su tutte le configurazioni
            }

            const sharedFolderIds = allFolders.filter(f => isSharedFolder(f)).map(f => f.id);
            const sharedNotes: any[] = [];

            for (const folderId of sharedFolderIds) {
                let notePage = 1;
                let noteHasMore = true;
                while (noteHasMore) {
                    const res = await joplin.data.get(['folders', folderId, 'notes'], {
                        fields: ['id', 'title', 'parent_id', 'is_shared'],
                        page: notePage++,
                    });
                    for (const note of res.items) {
                        const folder = folderMap.get(note.parent_id);
                        const isPublic = publicNoteIds.has(note.id) || note.is_shared === 1;
                        
                        sharedNotes.push({
                            id: note.id,
                            title: note.title || 'Untitled',
                            folderTitle: folder ? folder.title : 'Unknown',
                            shareType: isPublic ? '🌐 Public Link (World)' : '👥 Specific User(s)'
                        });
                    }
                    noteHasMore = res.has_more;
                }
            }
            return sharedNotes;
        }

        async function renderPanel() {
            await joplin.views.panels.setHtml(
                panel, 
                '<div style="padding: 10px; font-family: sans-serif; color: var(--joplin-color);">Loading shared notes...</div>'
            );
            
            const notes = await fetchSharedNotes();

            let itemsHtml = notes.map(n => `
                <li style="margin-bottom: 10px; font-size: 13px; border-bottom: 1px dashed var(--joplin-divider-color, #444); padding-bottom: 6px;">
                    <a href="#" onclick="webviewApi.postMessage({ name: 'openNote', id: '${n.id}' }); return false;" 
                       style="color: var(--joplin-url-color, #4a90e2); text-decoration: none; font-weight: bold;">
                        📄 ${escapeHtml(n.title)}
                    </a>
                    <div style="font-size: 11px; color: var(--joplin-color3, #888); margin-top: 3px;">
                        📂 ${escapeHtml(n.folderTitle)}
                    </div>
                    <div style="font-size: 10px; margin-top: 3px;">
                        <span style="background: rgba(127,127,127,0.15); padding: 2px 6px; border-radius: 3px; font-weight: 500;">
                            ${escapeHtml(n.shareType)}
                        </span>
                    </div>
                </li>
            `).join('');

            if (notes.length === 0) {
                itemsHtml = '<li style="font-size: 13px; color: #888;">No shared notes found.</li>';
            }

            const html = `
                <div style="padding: 12px; font-family: sans-serif; color: var(--joplin-color);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--joplin-divider-color, #ccc); padding-bottom: 8px;">
                        <h3 style="margin: 0; font-size: 14px;">👥 Shared Notes (${notes.length})</h3>
                        <button onclick="webviewApi.postMessage({ name: 'refresh' })" title="Refresh" style="padding: 3px 8px; cursor: pointer; border-radius: 4px; border: 1px solid #ccc; background: transparent; color: inherit;">🔄</button>
                    </div>
                    <ul style="list-style: none; padding-left: 0; margin: 0;">
                        ${itemsHtml}
                    </ul>
                </div>
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