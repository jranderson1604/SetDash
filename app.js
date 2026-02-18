// ===== SetDash - Sports Card Set Tracker =====
// All data stored in localStorage

(function () {
    'use strict';

    // ===== DATA LAYER =====
    const STORAGE_KEY = 'setdash_data';

    function loadData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : { sets: [] };
        } catch {
            return { sets: [] };
        }
    }

    function saveData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    let appData = loadData();

    // ===== KNOWN TEAMS (for Beckett checklist parsing) =====
    const KNOWN_TEAMS = [
        // NBA
        'Atlanta Hawks', 'Boston Celtics', 'Brooklyn Nets', 'Charlotte Hornets',
        'Chicago Bulls', 'Cleveland Cavaliers', 'Dallas Mavericks', 'Denver Nuggets',
        'Detroit Pistons', 'Golden State Warriors', 'Houston Rockets', 'Indiana Pacers',
        'LA Clippers', 'Los Angeles Clippers', 'Los Angeles Lakers', 'Memphis Grizzlies',
        'Miami Heat', 'Milwaukee Bucks', 'Minnesota Timberwolves', 'New Orleans Pelicans',
        'New York Knicks', 'Oklahoma City Thunder', 'Orlando Magic', 'Philadelphia 76ers',
        'Phoenix Suns', 'Portland Trail Blazers', 'Sacramento Kings', 'San Antonio Spurs',
        'Toronto Raptors', 'Utah Jazz', 'Washington Wizards',
        // MLB
        'Arizona Diamondbacks', 'Atlanta Braves', 'Baltimore Orioles', 'Boston Red Sox',
        'Chicago Cubs', 'Chicago White Sox', 'Cincinnati Reds', 'Cleveland Guardians',
        'Colorado Rockies', 'Detroit Tigers', 'Houston Astros', 'Kansas City Royals',
        'Los Angeles Angels', 'Los Angeles Dodgers', 'Miami Marlins', 'Milwaukee Brewers',
        'Minnesota Twins', 'New York Mets', 'New York Yankees', 'Oakland Athletics',
        'Philadelphia Phillies', 'Pittsburgh Pirates', 'San Diego Padres',
        'San Francisco Giants', 'Seattle Mariners', 'St. Louis Cardinals',
        'Tampa Bay Rays', 'Texas Rangers', 'Toronto Blue Jays', 'Washington Nationals',
        // NFL
        'Arizona Cardinals', 'Atlanta Falcons', 'Baltimore Ravens', 'Buffalo Bills',
        'Carolina Panthers', 'Chicago Bears', 'Cincinnati Bengals', 'Cleveland Browns',
        'Dallas Cowboys', 'Denver Broncos', 'Detroit Lions', 'Green Bay Packers',
        'Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars', 'Kansas City Chiefs',
        'Las Vegas Raiders', 'Los Angeles Chargers', 'Los Angeles Rams', 'Miami Dolphins',
        'Minnesota Vikings', 'New England Patriots', 'New Orleans Saints', 'New York Giants',
        'New York Jets', 'Philadelphia Eagles', 'Pittsburgh Steelers', 'San Francisco 49ers',
        'Seattle Seahawks', 'Tampa Bay Buccaneers', 'Tennessee Titans', 'Washington Commanders',
        // NHL
        'Anaheim Ducks', 'Arizona Coyotes', 'Boston Bruins', 'Buffalo Sabres',
        'Calgary Flames', 'Carolina Hurricanes', 'Colorado Avalanche', 'Columbus Blue Jackets',
        'Dallas Stars', 'Edmonton Oilers', 'Florida Panthers', 'Hartford Whalers',
        'Los Angeles Kings', 'Minnesota Wild', 'Montreal Canadiens', 'Nashville Predators',
        'New Jersey Devils', 'New York Islanders', 'New York Rangers', 'Ottawa Senators',
        'Philadelphia Flyers', 'Pittsburgh Penguins', 'San Jose Sharks', 'Seattle Kraken',
        'St. Louis Blues', 'Tampa Bay Lightning', 'Toronto Maple Leafs', 'Utah Hockey Club',
        'Vancouver Canucks', 'Vegas Golden Knights', 'Washington Capitals', 'Winnipeg Jets'
    ];

    // Build regex pattern from team names (sorted longest first to avoid partial matches)
    const TEAM_PATTERN = KNOWN_TEAMS
        .sort((a, b) => b.length - a.length)
        .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');

    // ===== BECKETT CHECKLIST PARSING =====
    function parseBeckettChecklist(text) {
        // Strip BOM and normalize whitespace
        text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Build regex: card_number + player_name + team_name
        const cardRegex = new RegExp(
            '(?:^|\\n|(?<=(?:' + TEAM_PATTERN + ')\\s*))' +
            '(\\d+)\\s+' +                    // card number
            '(.+?)\\s+' +                      // player name (non-greedy)
            '(' + TEAM_PATTERN + ')',           // team name
            'gi'
        );

        const cards = [];
        let match;
        while ((match = cardRegex.exec(text)) !== null) {
            const number = match[1].trim();
            const player = match[2].trim();
            const team = match[3].trim();

            // Skip if player name looks like preamble junk
            if (!player || /^\d+$/.test(player)) continue;

            cards.push({
                id: generateId(),
                number,
                player,
                team,
                subset: 'Base',
                owned: false
            });
        }

        return cards;
    }

    // Test whether text looks like a Beckett checklist (not CSV)
    function looksLikeBeckettChecklist(text) {
        // If it has commas/tabs separating fields with a header row, it's CSV
        const firstLine = text.trim().split(/\r?\n/)[0] || '';
        if (/,/.test(firstLine) && /\t/.test(firstLine) === false) {
            const fields = parseCSVLine(firstLine);
            if (fields.length >= 2) {
                const lower = fields.map(f => f.trim().toLowerCase());
                if (lower.some(f => /^(card|#|number|player|name|team)/.test(f))) {
                    return false; // Looks like a proper CSV header
                }
            }
        }

        // Check if text contains patterns like "1 Player Name Team Name"
        const teamTest = new RegExp('\\d+\\s+\\S+.*?\\s+(' + TEAM_PATTERN + ')', 'i');
        return teamTest.test(text);
    }

    // ===== CSV PARSING =====
    function parseCSV(text) {
        // Strip BOM
        text = text.replace(/^\uFEFF/, '');

        // Auto-detect: try Beckett checklist format first if it looks like one
        if (looksLikeBeckettChecklist(text)) {
            const beckettCards = parseBeckettChecklist(text);
            if (beckettCards.length > 0) return beckettCards;
        }

        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) return [];

        // Parse header - handle quoted fields
        const header = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());

        // Try to detect column mapping from Beckett format
        const colMap = detectColumns(header);

        const cards = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const fields = parseCSVLine(line);
            if (fields.length < 2) continue;

            const card = {
                id: generateId(),
                number: getField(fields, colMap.number) || '',
                player: getField(fields, colMap.player) || '',
                team: getField(fields, colMap.team) || '',
                subset: getField(fields, colMap.subset) || 'Base',
                owned: false
            };

            // Clean up card number - remove leading # or "No."
            card.number = card.number.replace(/^(#|No\.?\s*)/i, '').trim();

            // Skip completely empty rows
            if (!card.number && !card.player) continue;

            cards.push(card);
        }

        // If CSV parsing produced bad results, try Beckett as fallback
        if (cards.length === 0) {
            const beckettCards = parseBeckettChecklist(text);
            if (beckettCards.length > 0) return beckettCards;
        }

        return cards;
    }

    function parseCSVLine(line) {
        const fields = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else if (ch === '"') {
                    inQuotes = false;
                } else {
                    current += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',' || ch === '\t') {
                    fields.push(current.trim());
                    current = '';
                } else {
                    current += ch;
                }
            }
        }
        fields.push(current.trim());
        return fields;
    }

    function detectColumns(header) {
        const map = { number: 0, player: 1, team: 2, subset: -1 };

        header.forEach((h, i) => {
            const lower = h.toLowerCase();
            if (/^(card\s*#|number|#|no|card\s*number|card\s*no)$/.test(lower)) map.number = i;
            else if (/^(player|name|player\s*name|subject)$/.test(lower)) map.player = i;
            else if (/^(team|team\s*name)$/.test(lower)) map.team = i;
            else if (/^(subset|insert|set\s*name|type|parallel|variation|series)$/.test(lower)) map.subset = i;
        });

        return map;
    }

    function getField(fields, index) {
        if (index < 0 || index >= fields.length) return '';
        return fields[index].trim();
    }

    // ===== EXCEL (.xlsx) PARSING =====
    function parseExcel(arrayBuffer) {
        if (typeof XLSX === 'undefined') {
            alert('Excel support is loading. Please try again in a moment.');
            return [];
        }

        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Convert to CSV text, then use existing parseCSV
        const csvText = XLSX.utils.sheet_to_csv(sheet);
        return parseCSV(csvText);
    }

    function isExcelFile(file) {
        if (!file) return false;
        const name = file.name.toLowerCase();
        return name.endsWith('.xlsx') || name.endsWith('.xls');
    }

    // ===== SORTING HELPERS =====
    function naturalSort(a, b) {
        // Sort card numbers naturally: 1, 2, 10, 100, A1, B2, etc.
        const aParts = a.match(/(\d+|\D+)/g) || [''];
        const bParts = b.match(/(\d+|\D+)/g) || [''];

        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const ap = aParts[i] || '';
            const bp = bParts[i] || '';
            const an = parseInt(ap);
            const bn = parseInt(bp);

            if (!isNaN(an) && !isNaN(bn)) {
                if (an !== bn) return an - bn;
            } else {
                const cmp = ap.localeCompare(bp);
                if (cmp !== 0) return cmp;
            }
        }
        return 0;
    }

    function getLastName(fullName) {
        if (!fullName) return '';
        const parts = fullName.trim().split(/\s+/);
        // Handle suffixes like Jr., Sr., III, II, IV
        const suffixes = ['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v'];
        let last = parts[parts.length - 1];
        if (parts.length > 2 && suffixes.includes(last.toLowerCase())) {
            last = parts[parts.length - 2];
        }
        return last;
    }

    // ===== RENDER: MY SETS TAB =====
    function renderSetsGrid() {
        const grid = document.getElementById('sets-grid');
        let sets = [...appData.sets];

        // Apply filters
        const sportFilter = document.getElementById('filter-sport').value;
        const yearFilter = document.getElementById('filter-year').value;
        const brandFilter = document.getElementById('filter-brand').value;
        const searchTerm = document.getElementById('search-sets').value.toLowerCase();

        if (sportFilter !== 'all') sets = sets.filter(s => s.sport === sportFilter);
        if (yearFilter !== 'all') sets = sets.filter(s => s.year === yearFilter);
        if (brandFilter !== 'all') sets = sets.filter(s => s.brand.toLowerCase() === brandFilter.toLowerCase());
        if (searchTerm) sets = sets.filter(s => s.name.toLowerCase().includes(searchTerm));

        // Apply sort
        const sortVal = document.getElementById('sort-sets').value;
        sets.sort((a, b) => {
            switch (sortVal) {
                case 'name-asc': return a.name.localeCompare(b.name);
                case 'name-desc': return b.name.localeCompare(a.name);
                case 'year-desc': return b.year.localeCompare(a.year);
                case 'year-asc': return a.year.localeCompare(b.year);
                case 'progress-desc': return getProgress(b) - getProgress(a);
                case 'progress-asc': return getProgress(a) - getProgress(b);
                case 'sport': return a.sport.localeCompare(b.sport);
                default: return 0;
            }
        });

        if (sets.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <h3>No Sets Yet</h3>
                    <p>Click "+ New Set" to create your first set, or import from a Beckett CSV.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = sets.map(set => {
            const total = set.cards.length;
            const owned = set.cards.filter(c => c.owned).length;
            const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
            const subsets = [...new Set(set.cards.map(c => c.subset || 'Base'))];
            const insertCount = set.cards.filter(c => c.subset && c.subset !== 'Base').length;

            return `
                <div class="set-card" data-set-id="${set.id}">
                    <div class="set-card-header">
                        <div class="set-card-name">${escHtml(set.name)}</div>
                        <span class="set-card-badge badge-${set.sport}">${set.sport}</span>
                    </div>
                    <div class="set-card-meta">
                        <span>${escHtml(set.year)}</span>
                        <span>${escHtml(set.brand)}</span>
                        <span>${total} cards${insertCount > 0 ? ` (${insertCount} inserts)` : ''}</span>
                    </div>
                    <div class="set-card-progress">
                        <div class="progress-bar">
                            <div class="progress-fill ${pct === 100 ? 'complete' : ''}" style="width:${pct}%"></div>
                        </div>
                        <div class="progress-text">
                            <span>${owned} / ${total} owned</span>
                            <span>${pct}%</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Click handlers
        grid.querySelectorAll('.set-card').forEach(card => {
            card.addEventListener('click', () => openSetDetail(card.dataset.setId));
        });
    }

    function getProgress(set) {
        if (!set.cards.length) return 0;
        return set.cards.filter(c => c.owned).length / set.cards.length;
    }

    function populateFilterDropdowns() {
        const years = [...new Set(appData.sets.map(s => s.year))].sort().reverse();
        const brands = [...new Set(appData.sets.map(s => s.brand))].sort();

        const yearSelect = document.getElementById('filter-year');
        const brandSelect = document.getElementById('filter-brand');
        const yearVal = yearSelect.value;
        const brandVal = brandSelect.value;

        yearSelect.innerHTML = '<option value="all">All Years</option>' +
            years.map(y => `<option value="${escHtml(y)}">${escHtml(y)}</option>`).join('');
        brandSelect.innerHTML = '<option value="all">All Brands</option>' +
            brands.map(b => `<option value="${escHtml(b)}">${escHtml(b)}</option>`).join('');

        yearSelect.value = yearVal;
        brandSelect.value = brandVal;

        // Binder set select
        const binderSelect = document.getElementById('binder-set-select');
        const binderVal = binderSelect.value;
        binderSelect.innerHTML = '<option value="">-- Select a Set --</option>' +
            appData.sets.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
        binderSelect.value = binderVal;
    }

    // ===== SET DETAIL =====
    let currentDetailSetId = null;
    let detailSortCol = 'number';
    let detailSortDir = 'asc';

    function openSetDetail(setId) {
        currentDetailSetId = setId;
        const set = appData.sets.find(s => s.id === setId);
        if (!set) return;

        document.getElementById('detail-set-name').textContent = set.name;

        // Populate subset filter
        const subsets = ['all', 'base', ...new Set(set.cards.filter(c => c.subset && c.subset !== 'Base').map(c => c.subset))];
        const subsetFilter = document.getElementById('detail-subset-filter');
        subsetFilter.innerHTML = subsets.map(s => {
            if (s === 'all') return '<option value="all">All</option>';
            if (s === 'base') return '<option value="base">Base Only</option>';
            return `<option value="${escHtml(s)}">${escHtml(s)}</option>`;
        }).join('');

        renderDetailTable();
        showModal('modal-set-detail');
    }

    function renderDetailTable() {
        const set = appData.sets.find(s => s.id === currentDetailSetId);
        if (!set) return;

        let cards = [...set.cards];

        // Filters
        const subsetFilter = document.getElementById('detail-subset-filter').value;
        const showFilter = document.getElementById('detail-show-filter').value;
        const search = document.getElementById('detail-search').value.toLowerCase();

        if (subsetFilter === 'base') {
            cards = cards.filter(c => !c.subset || c.subset === 'Base');
        } else if (subsetFilter !== 'all') {
            cards = cards.filter(c => c.subset === subsetFilter);
        }

        if (showFilter === 'owned') cards = cards.filter(c => c.owned);
        if (showFilter === 'needed') cards = cards.filter(c => !c.owned);
        if (search) cards = cards.filter(c =>
            c.number.toLowerCase().includes(search) ||
            c.player.toLowerCase().includes(search) ||
            c.team.toLowerCase().includes(search)
        );

        // Sort
        cards.sort((a, b) => {
            let cmp = 0;
            switch (detailSortCol) {
                case 'number': cmp = naturalSort(a.number, b.number); break;
                case 'player': cmp = a.player.localeCompare(b.player); break;
                case 'team': cmp = a.team.localeCompare(b.team); break;
                case 'subset': cmp = (a.subset || '').localeCompare(b.subset || ''); break;
            }
            return detailSortDir === 'asc' ? cmp : -cmp;
        });

        // Stats
        const totalAll = set.cards.length;
        const ownedAll = set.cards.filter(c => c.owned).length;
        const pct = totalAll > 0 ? Math.round((ownedAll / totalAll) * 100) : 0;
        document.getElementById('detail-stats').innerHTML =
            `<strong>${ownedAll}</strong> / <strong>${totalAll}</strong> owned (${pct}%) &nbsp; | &nbsp; Showing <strong>${cards.length}</strong> cards`;
        document.getElementById('detail-progress-fill').style.width = pct + '%';

        // Sort indicators
        document.querySelectorAll('#detail-card-table th.sortable').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
            if (th.dataset.sort === detailSortCol) {
                th.classList.add(detailSortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
            }
        });

        // Render rows
        const tbody = document.getElementById('detail-card-tbody');
        tbody.innerHTML = cards.map(card => `
            <tr class="${card.owned ? 'owned-row' : ''}" data-card-id="${card.id}">
                <td class="col-check"><input type="checkbox" class="card-select" data-card-id="${card.id}"></td>
                <td class="col-num">${escHtml(card.number)}</td>
                <td class="col-player">${escHtml(card.player)}</td>
                <td class="col-team">${escHtml(card.team)}</td>
                <td class="col-subset">${card.subset && card.subset !== 'Base'
                ? `<span class="subset-tag">${escHtml(card.subset)}</span>`
                : 'Base'}</td>
                <td class="col-owned">
                    <input type="checkbox" class="card-owned-toggle" data-card-id="${card.id}" ${card.owned ? 'checked' : ''}>
                </td>
            </tr>
        `).join('');

        // Owned toggle handlers
        tbody.querySelectorAll('.card-owned-toggle').forEach(cb => {
            cb.addEventListener('change', () => {
                const cardId = cb.dataset.cardId;
                const card = set.cards.find(c => c.id === cardId);
                if (card) {
                    card.owned = cb.checked;
                    saveData(appData);
                    renderDetailTable();
                    renderSetsGrid();
                }
            });
        });
    }

    // ===== BINDER VIEW =====
    function renderBinderView() {
        const setId = document.getElementById('binder-set-select').value;
        const container = document.getElementById('binder-pages');
        const statsEl = document.getElementById('binder-stats');

        if (!setId) {
            container.innerHTML = '<div class="empty-state"><h3>Select a Set</h3><p>Choose a set from the dropdown to view it in binder layout.</p></div>';
            statsEl.textContent = '';
            return;
        }

        const set = appData.sets.find(s => s.id === setId);
        if (!set) return;

        let cards = [...set.cards];

        // Subset filter
        const subsetFilter = document.getElementById('binder-subset-select').value;
        if (subsetFilter === 'base') {
            cards = cards.filter(c => !c.subset || c.subset === 'Base');
        }

        // Show filter
        const showFilter = document.getElementById('binder-show').value;
        if (showFilter === 'owned') cards = cards.filter(c => c.owned);
        if (showFilter === 'needed') cards = cards.filter(c => !c.owned);

        // Sort
        const sortBy = document.getElementById('binder-sort').value;
        let groupedCards;

        if (sortBy === 'team') {
            groupedCards = sortAndGroupByTeam(cards);
        } else if (sortBy === 'last-name') {
            groupedCards = sortAndGroupByLastName(cards);
        } else {
            groupedCards = sortAndGroupByNumber(cards);
        }

        // Stats
        const totalOwned = cards.filter(c => c.owned).length;
        statsEl.textContent = `${totalOwned} / ${cards.length} owned (${cards.length > 0 ? Math.round((totalOwned / cards.length) * 100) : 0}%)`;

        // Render pages
        let html = '';
        let pageNum = 1;

        groupedCards.forEach(group => {
            // Add section header for grouped views
            if (group.label) {
                html += `<div class="binder-section-header">${escHtml(group.label)}</div>`;
            }

            // Split group into pages of 9
            const pages = chunkArray(group.cards, 9);
            pages.forEach(pageCards => {
                html += renderBinderPage(pageCards, pageNum, group.label);
                pageNum++;
            });
        });

        container.innerHTML = html;

        // Click handlers for binder slots to toggle owned
        container.querySelectorAll('.binder-slot[data-card-id]').forEach(slot => {
            slot.addEventListener('click', () => {
                const cardId = slot.dataset.cardId;
                const card = set.cards.find(c => c.id === cardId);
                if (card) {
                    card.owned = !card.owned;
                    saveData(appData);
                    renderBinderView();
                    renderSetsGrid();
                }
            });
        });
    }

    function sortAndGroupByNumber(cards) {
        cards.sort((a, b) => naturalSort(a.number, b.number));
        return [{ label: null, cards }];
    }

    function sortAndGroupByTeam(cards) {
        // Group by team, then sort within each team by card number
        const teamMap = {};
        cards.forEach(c => {
            const team = c.team || 'Unknown';
            if (!teamMap[team]) teamMap[team] = [];
            teamMap[team].push(c);
        });

        const teams = Object.keys(teamMap).sort();
        return teams.map(team => {
            const teamCards = teamMap[team];
            teamCards.sort((a, b) => naturalSort(a.number, b.number));
            return { label: team, cards: teamCards };
        });
    }

    function sortAndGroupByLastName(cards) {
        // Group by first letter of last name, sort alphabetically
        cards.sort((a, b) => {
            const la = getLastName(a.player).toLowerCase();
            const lb = getLastName(b.player).toLowerCase();
            return la.localeCompare(lb) || naturalSort(a.number, b.number);
        });

        const letterMap = {};
        cards.forEach(c => {
            const ln = getLastName(c.player);
            const letter = ln ? ln[0].toUpperCase() : '#';
            if (!letterMap[letter]) letterMap[letter] = [];
            letterMap[letter].push(c);
        });

        const letters = Object.keys(letterMap).sort();
        return letters.map(letter => ({
            label: letter,
            cards: letterMap[letter]
        }));
    }

    function renderBinderPage(cards, pageNum, groupLabel) {
        // Pad to 9 slots
        const slots = [...cards];
        while (slots.length < 9) slots.push(null);

        const slotsHtml = slots.map((card, i) => {
            if (!card) {
                return '<div class="binder-slot empty-slot"></div>';
            }
            const cls = card.owned ? 'owned' : 'needed';
            return `
                <div class="binder-slot ${cls}" data-card-id="${card.id}" title="Click to toggle owned">
                    ${card.owned ? '<div class="owned-check">&#10003;</div>' : ''}
                    <div class="slot-number">#${escHtml(card.number)}</div>
                    <div class="slot-player">${escHtml(card.player)}</div>
                    <div class="slot-team">${escHtml(card.team)}</div>
                    ${card.subset && card.subset !== 'Base' ? `<div class="slot-subset">${escHtml(card.subset)}</div>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="binder-page">
                <div class="binder-page-header">
                    <span class="binder-page-label">${groupLabel ? escHtml(groupLabel) + ' - ' : ''}Page ${pageNum}</span>
                    <span class="binder-page-number">Slots ${(pageNum - 1) * 9 + 1}-${(pageNum - 1) * 9 + cards.length}</span>
                </div>
                <div class="binder-grid">${slotsHtml}</div>
            </div>
        `;
    }

    function chunkArray(arr, size) {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks.length ? chunks : [[]];
    }

    // ===== MODALS =====
    function showModal(id) {
        document.getElementById(id).classList.remove('hidden');
    }

    function hideModal(id) {
        document.getElementById(id).classList.add('hidden');
    }

    function hideAllModals() {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    }

    // ===== CREATE SET =====
    let pendingCSVCards = [];

    function openNewSetModal() {
        document.getElementById('new-set-name').value = '';
        document.getElementById('new-set-sport').value = 'basketball';
        document.getElementById('new-set-year').value = '';
        document.getElementById('new-set-brand').value = '';
        document.getElementById('csv-paste').value = '';
        document.getElementById('csv-filename').textContent = '';
        document.getElementById('csv-preview').classList.add('hidden');
        pendingCSVCards = [];
        showModal('modal-new-set');
    }

    function handleFileUpload(file) {
        if (isExcelFile(file)) {
            const reader = new FileReader();
            reader.onload = () => {
                const cards = parseExcel(reader.result);
                document.getElementById('csv-filename').textContent = file.name;
                pendingCSVCards = cards;
                showImportPreview(cards, file.name);
            };
            reader.readAsArrayBuffer(file);
        } else {
            const reader = new FileReader();
            reader.onload = () => handleCSVInput(reader.result, file.name);
            reader.readAsText(file);
        }
    }

    function showImportPreview(cards, filename) {
        if (cards.length === 0) {
            document.getElementById('csv-preview').classList.add('hidden');
            return;
        }

        document.getElementById('csv-count').textContent = cards.length;
        document.getElementById('csv-preview').classList.remove('hidden');

        const thead = document.querySelector('#csv-preview-table thead');
        const tbody = document.querySelector('#csv-preview-table tbody');
        thead.innerHTML = '<tr><th>#</th><th>Player</th><th>Team</th><th>Subset</th></tr>';
        tbody.innerHTML = cards.slice(0, 50).map(c => `
            <tr>
                <td>${escHtml(c.number)}</td>
                <td>${escHtml(c.player)}</td>
                <td>${escHtml(c.team)}</td>
                <td>${escHtml(c.subset)}</td>
            </tr>
        `).join('') + (cards.length > 50 ? `<tr><td colspan="4" style="color:var(--text-muted)">... and ${cards.length - 50} more</td></tr>` : '');

        // Auto-detect year from filename
        if (!document.getElementById('new-set-year').value && filename) {
            const yearMatch = filename.match(/(20\d{2}(-\d{2})?)/);
            if (yearMatch) document.getElementById('new-set-year').value = yearMatch[1];
        }
    }

    function handleCSVInput(text, filename) {
        if (filename) {
            document.getElementById('csv-filename').textContent = filename;
        }

        pendingCSVCards = parseCSV(text);
        if (pendingCSVCards.length === 0) {
            document.getElementById('csv-preview').classList.add('hidden');
            return;
        }

        document.getElementById('csv-count').textContent = pendingCSVCards.length;
        document.getElementById('csv-preview').classList.remove('hidden');

        const thead = document.querySelector('#csv-preview-table thead');
        const tbody = document.querySelector('#csv-preview-table tbody');
        thead.innerHTML = '<tr><th>#</th><th>Player</th><th>Team</th><th>Subset</th></tr>';
        tbody.innerHTML = pendingCSVCards.slice(0, 50).map(c => `
            <tr>
                <td>${escHtml(c.number)}</td>
                <td>${escHtml(c.player)}</td>
                <td>${escHtml(c.team)}</td>
                <td>${escHtml(c.subset)}</td>
            </tr>
        `).join('') + (pendingCSVCards.length > 50 ? `<tr><td colspan="4" style="color:var(--text-muted)">... and ${pendingCSVCards.length - 50} more</td></tr>` : '');

        // Auto-detect set info from data
        if (!document.getElementById('new-set-year').value) {
            // Try to guess year from filename or data
            const yearMatch = (filename || '').match(/(20\d{2}(-\d{2})?)/);
            if (yearMatch) document.getElementById('new-set-year').value = yearMatch[1];
        }
    }

    function createSet() {
        const name = document.getElementById('new-set-name').value.trim();
        const sport = document.getElementById('new-set-sport').value;
        const year = document.getElementById('new-set-year').value.trim();
        const brand = document.getElementById('new-set-brand').value.trim();

        if (!name) {
            alert('Please enter a set name.');
            return;
        }

        // Check for CSV paste if no file was used
        if (pendingCSVCards.length === 0) {
            const pasteText = document.getElementById('csv-paste').value.trim();
            if (pasteText) {
                pendingCSVCards = parseCSV(pasteText);
            }
        }

        const set = {
            id: generateId(),
            name,
            sport,
            year,
            brand,
            cards: pendingCSVCards.length > 0 ? pendingCSVCards : [],
            createdAt: new Date().toISOString()
        };

        appData.sets.push(set);
        saveData(appData);
        pendingCSVCards = [];
        hideModal('modal-new-set');
        populateFilterDropdowns();
        renderSetsGrid();
    }

    // ===== ADD CARDS MANUALLY =====
    function openAddCardsModal() {
        document.getElementById('add-cards-rows').innerHTML = createAddCardRow();
        showModal('modal-add-cards');
    }

    function createAddCardRow() {
        return `
            <div class="add-card-row">
                <input type="text" placeholder="Card #" class="add-num">
                <input type="text" placeholder="Player Name" class="add-player">
                <input type="text" placeholder="Team" class="add-team">
                <input type="text" placeholder="Subset (optional)" class="add-subset">
                <button class="btn-icon btn-remove-row" title="Remove">&times;</button>
            </div>
        `;
    }

    function saveManualCards() {
        const set = appData.sets.find(s => s.id === currentDetailSetId);
        if (!set) return;

        const rows = document.querySelectorAll('#add-cards-rows .add-card-row');
        let added = 0;
        rows.forEach(row => {
            const num = row.querySelector('.add-num').value.trim();
            const player = row.querySelector('.add-player').value.trim();
            const team = row.querySelector('.add-team').value.trim();
            const subset = row.querySelector('.add-subset').value.trim();

            if (num || player) {
                set.cards.push({
                    id: generateId(),
                    number: num,
                    player,
                    team,
                    subset: subset || 'Base',
                    owned: false
                });
                added++;
            }
        });

        if (added > 0) {
            saveData(appData);
            renderDetailTable();
            renderSetsGrid();
        }

        hideModal('modal-add-cards');
    }

    // ===== DELETE SET =====
    function deleteCurrentSet() {
        if (!currentDetailSetId) return;
        const set = appData.sets.find(s => s.id === currentDetailSetId);
        if (!set) return;

        if (!confirm(`Are you sure you want to delete "${set.name}"? This cannot be undone.`)) return;

        appData.sets = appData.sets.filter(s => s.id !== currentDetailSetId);
        saveData(appData);
        currentDetailSetId = null;
        hideModal('modal-set-detail');
        populateFilterDropdowns();
        renderSetsGrid();
    }

    // ===== IMPORT MORE TO EXISTING SET =====
    function importMoreCSV() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.txt,.xlsx,.xls';
        input.addEventListener('change', () => {
            const file = input.files[0];
            if (!file) return;

            if (isExcelFile(file)) {
                const reader = new FileReader();
                reader.onload = () => {
                    const cards = parseExcel(reader.result);
                    mergeImportedCards(cards);
                };
                reader.readAsArrayBuffer(file);
            } else {
                const reader = new FileReader();
                reader.onload = () => {
                    const cards = parseCSV(reader.result);
                    mergeImportedCards(cards);
                };
                reader.readAsText(file);
            }
        });
        input.click();
    }

    function mergeImportedCards(cards) {
        if (cards.length === 0) {
            alert('No cards found in file.');
            return;
        }
        const set = appData.sets.find(s => s.id === currentDetailSetId);
        if (!set) return;

        // Merge: skip duplicates by card number
        const existingNums = new Set(set.cards.map(c => c.number));
        let added = 0;
        cards.forEach(c => {
            if (!existingNums.has(c.number)) {
                set.cards.push(c);
                existingNums.add(c.number);
                added++;
            }
        });

        saveData(appData);
        renderDetailTable();
        renderSetsGrid();
        alert(`Imported ${added} new cards (${cards.length - added} duplicates skipped).`);
    }

    // ===== UTILITY =====
    function escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ===== SEED DATA: 2025-26 Topps Flagship Basketball =====
    function seedTopps2025Basketball() {
        // Check if already exists
        if (appData.sets.some(s => s.name === '2025-26 Topps Flagship Basketball')) return;

        const teams = {
            ATL: 'Atlanta Hawks', BOS: 'Boston Celtics', BKN: 'Brooklyn Nets',
            CHA: 'Charlotte Hornets', CHI: 'Chicago Bulls', CLE: 'Cleveland Cavaliers',
            DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets', DET: 'Detroit Pistons',
            GSW: 'Golden State Warriors', HOU: 'Houston Rockets', IND: 'Indiana Pacers',
            LAC: 'LA Clippers', LAL: 'Los Angeles Lakers', MEM: 'Memphis Grizzlies',
            MIA: 'Miami Heat', MIL: 'Milwaukee Bucks', MIN: 'Minnesota Timberwolves',
            NOP: 'New Orleans Pelicans', NYK: 'New York Knicks', OKC: 'Oklahoma City Thunder',
            ORL: 'Orlando Magic', PHI: 'Philadelphia 76ers', PHX: 'Phoenix Suns',
            POR: 'Portland Trail Blazers', SAC: 'Sacramento Kings', SAS: 'San Antonio Spurs',
            TOR: 'Toronto Raptors', UTA: 'Utah Jazz', WAS: 'Washington Wizards'
        };

        // Base set: 300 cards - top players from each team
        const basePlayers = [
            // Atlanta Hawks
            ['1', 'Trae Young', 'Atlanta Hawks'],
            ['2', 'Dejounte Murray', 'Atlanta Hawks'],
            ['3', 'Jalen Johnson', 'Atlanta Hawks'],
            ['4', 'De\'Andre Hunter', 'Atlanta Hawks'],
            ['5', 'Bogdan Bogdanovic', 'Atlanta Hawks'],
            ['6', 'Onyeka Okongwu', 'Atlanta Hawks'],
            ['7', 'Dyson Daniels', 'Atlanta Hawks'],
            ['8', 'Zaccharie Risacher', 'Atlanta Hawks'],
            // Boston Celtics
            ['9', 'Jayson Tatum', 'Boston Celtics'],
            ['10', 'Jaylen Brown', 'Boston Celtics'],
            ['11', 'Derrick White', 'Boston Celtics'],
            ['12', 'Kristaps Porzingis', 'Boston Celtics'],
            ['13', 'Jrue Holiday', 'Boston Celtics'],
            ['14', 'Al Horford', 'Boston Celtics'],
            ['15', 'Payton Pritchard', 'Boston Celtics'],
            ['16', 'Sam Hauser', 'Boston Celtics'],
            // Brooklyn Nets
            ['17', 'Mikal Bridges', 'Brooklyn Nets'],
            ['18', 'Cameron Johnson', 'Brooklyn Nets'],
            ['19', 'Nic Claxton', 'Brooklyn Nets'],
            ['20', 'Ben Simmons', 'Brooklyn Nets'],
            // Charlotte Hornets
            ['21', 'LaMelo Ball', 'Charlotte Hornets'],
            ['22', 'Brandon Miller', 'Charlotte Hornets'],
            ['23', 'Mark Williams', 'Charlotte Hornets'],
            ['24', 'Miles Bridges', 'Charlotte Hornets'],
            ['25', 'Tre Mann', 'Charlotte Hornets'],
            ['26', 'Tidjane Salaun', 'Charlotte Hornets'],
            // Chicago Bulls
            ['27', 'Zach LaVine', 'Chicago Bulls'],
            ['28', 'Coby White', 'Chicago Bulls'],
            ['29', 'Patrick Williams', 'Chicago Bulls'],
            ['30', 'Nikola Vucevic', 'Chicago Bulls'],
            ['31', 'Josh Giddey', 'Chicago Bulls'],
            ['32', 'Matas Buzelis', 'Chicago Bulls'],
            // Cleveland Cavaliers
            ['33', 'Donovan Mitchell', 'Cleveland Cavaliers'],
            ['34', 'Darius Garland', 'Cleveland Cavaliers'],
            ['35', 'Evan Mobley', 'Cleveland Cavaliers'],
            ['36', 'Jarrett Allen', 'Cleveland Cavaliers'],
            ['37', 'Caris LeVert', 'Cleveland Cavaliers'],
            ['38', 'Max Strus', 'Cleveland Cavaliers'],
            // Dallas Mavericks
            ['39', 'Luka Doncic', 'Dallas Mavericks'],
            ['40', 'Kyrie Irving', 'Dallas Mavericks'],
            ['41', 'Daniel Gafford', 'Dallas Mavericks'],
            ['42', 'P.J. Washington', 'Dallas Mavericks'],
            ['43', 'Dereck Lively II', 'Dallas Mavericks'],
            ['44', 'Klay Thompson', 'Dallas Mavericks'],
            // Denver Nuggets
            ['45', 'Nikola Jokic', 'Denver Nuggets'],
            ['46', 'Jamal Murray', 'Denver Nuggets'],
            ['47', 'Aaron Gordon', 'Denver Nuggets'],
            ['48', 'Michael Porter Jr.', 'Denver Nuggets'],
            ['49', 'Kentavious Caldwell-Pope', 'Denver Nuggets'],
            ['50', 'Christian Braun', 'Denver Nuggets'],
            // Detroit Pistons
            ['51', 'Cade Cunningham', 'Detroit Pistons'],
            ['52', 'Jaden Ivey', 'Detroit Pistons'],
            ['53', 'Ausar Thompson', 'Detroit Pistons'],
            ['54', 'Jalen Duren', 'Detroit Pistons'],
            ['55', 'Ron Holland II', 'Detroit Pistons'],
            // Golden State Warriors
            ['56', 'Stephen Curry', 'Golden State Warriors'],
            ['57', 'Andrew Wiggins', 'Golden State Warriors'],
            ['58', 'Draymond Green', 'Golden State Warriors'],
            ['59', 'Jonathan Kuminga', 'Golden State Warriors'],
            ['60', 'Brandin Podziemski', 'Golden State Warriors'],
            ['61', 'Buddy Hield', 'Golden State Warriors'],
            // Houston Rockets
            ['62', 'Jalen Green', 'Houston Rockets'],
            ['63', 'Alperen Sengun', 'Houston Rockets'],
            ['64', 'Jabari Smith Jr.', 'Houston Rockets'],
            ['65', 'Fred VanVleet', 'Houston Rockets'],
            ['66', 'Amen Thompson', 'Houston Rockets'],
            ['67', 'Dillon Brooks', 'Houston Rockets'],
            ['68', 'Reed Sheppard', 'Houston Rockets'],
            // Indiana Pacers
            ['69', 'Tyrese Haliburton', 'Indiana Pacers'],
            ['70', 'Pascal Siakam', 'Indiana Pacers'],
            ['71', 'Myles Turner', 'Indiana Pacers'],
            ['72', 'Bennedict Mathurin', 'Indiana Pacers'],
            ['73', 'Andrew Nembhard', 'Indiana Pacers'],
            ['74', 'Aaron Nesmith', 'Indiana Pacers'],
            // LA Clippers
            ['75', 'James Harden', 'LA Clippers'],
            ['76', 'Kawhi Leonard', 'LA Clippers'],
            ['77', 'Norman Powell', 'LA Clippers'],
            ['78', 'Ivica Zubac', 'LA Clippers'],
            // Los Angeles Lakers
            ['79', 'LeBron James', 'Los Angeles Lakers'],
            ['80', 'Anthony Davis', 'Los Angeles Lakers'],
            ['81', 'Austin Reaves', 'Los Angeles Lakers'],
            ['82', 'D\'Angelo Russell', 'Los Angeles Lakers'],
            ['83', 'Rui Hachimura', 'Los Angeles Lakers'],
            ['84', 'Dalton Knecht', 'Los Angeles Lakers'],
            ['85', 'Bronny James', 'Los Angeles Lakers'],
            // Memphis Grizzlies
            ['86', 'Ja Morant', 'Memphis Grizzlies'],
            ['87', 'Desmond Bane', 'Memphis Grizzlies'],
            ['88', 'Jaren Jackson Jr.', 'Memphis Grizzlies'],
            ['89', 'Marcus Smart', 'Memphis Grizzlies'],
            ['90', 'Zach Edey', 'Memphis Grizzlies'],
            // Miami Heat
            ['91', 'Jimmy Butler', 'Miami Heat'],
            ['92', 'Bam Adebayo', 'Miami Heat'],
            ['93', 'Tyler Herro', 'Miami Heat'],
            ['94', 'Terry Rozier', 'Miami Heat'],
            ['95', 'Jaime Jaquez Jr.', 'Miami Heat'],
            // Milwaukee Bucks
            ['96', 'Giannis Antetokounmpo', 'Milwaukee Bucks'],
            ['97', 'Damian Lillard', 'Milwaukee Bucks'],
            ['98', 'Khris Middleton', 'Milwaukee Bucks'],
            ['99', 'Brook Lopez', 'Milwaukee Bucks'],
            ['100', 'Bobby Portis', 'Milwaukee Bucks'],
            // Minnesota Timberwolves
            ['101', 'Anthony Edwards', 'Minnesota Timberwolves'],
            ['102', 'Karl-Anthony Towns', 'Minnesota Timberwolves'],
            ['103', 'Rudy Gobert', 'Minnesota Timberwolves'],
            ['104', 'Jaden McDaniels', 'Minnesota Timberwolves'],
            ['105', 'Mike Conley', 'Minnesota Timberwolves'],
            ['106', 'Naz Reid', 'Minnesota Timberwolves'],
            // New Orleans Pelicans
            ['107', 'Zion Williamson', 'New Orleans Pelicans'],
            ['108', 'Brandon Ingram', 'New Orleans Pelicans'],
            ['109', 'CJ McCollum', 'New Orleans Pelicans'],
            ['110', 'Herb Jones', 'New Orleans Pelicans'],
            ['111', 'Trey Murphy III', 'New Orleans Pelicans'],
            // New York Knicks
            ['112', 'Jalen Brunson', 'New York Knicks'],
            ['113', 'Julius Randle', 'New York Knicks'],
            ['114', 'OG Anunoby', 'New York Knicks'],
            ['115', 'Josh Hart', 'New York Knicks'],
            ['116', 'Donte DiVincenzo', 'New York Knicks'],
            ['117', 'Mitchell Robinson', 'New York Knicks'],
            // Oklahoma City Thunder
            ['118', 'Shai Gilgeous-Alexander', 'Oklahoma City Thunder'],
            ['119', 'Chet Holmgren', 'Oklahoma City Thunder'],
            ['120', 'Jalen Williams', 'Oklahoma City Thunder'],
            ['121', 'Luguentz Dort', 'Oklahoma City Thunder'],
            ['122', 'Isaiah Hartenstein', 'Oklahoma City Thunder'],
            ['123', 'Alex Caruso', 'Oklahoma City Thunder'],
            ['124', 'Nikola Topic', 'Oklahoma City Thunder'],
            // Orlando Magic
            ['125', 'Paolo Banchero', 'Orlando Magic'],
            ['126', 'Franz Wagner', 'Orlando Magic'],
            ['127', 'Jalen Suggs', 'Orlando Magic'],
            ['128', 'Wendell Carter Jr.', 'Orlando Magic'],
            ['129', 'Cole Anthony', 'Orlando Magic'],
            // Philadelphia 76ers
            ['130', 'Joel Embiid', 'Philadelphia 76ers'],
            ['131', 'Tyrese Maxey', 'Philadelphia 76ers'],
            ['132', 'Paul George', 'Philadelphia 76ers'],
            ['133', 'Kelly Oubre Jr.', 'Philadelphia 76ers'],
            ['134', 'Caleb Martin', 'Philadelphia 76ers'],
            // Phoenix Suns
            ['135', 'Kevin Durant', 'Phoenix Suns'],
            ['136', 'Devin Booker', 'Phoenix Suns'],
            ['137', 'Bradley Beal', 'Phoenix Suns'],
            ['138', 'Jusuf Nurkic', 'Phoenix Suns'],
            ['139', 'Grayson Allen', 'Phoenix Suns'],
            // Portland Trail Blazers
            ['140', 'Anfernee Simons', 'Portland Trail Blazers'],
            ['141', 'Scoot Henderson', 'Portland Trail Blazers'],
            ['142', 'Jerami Grant', 'Portland Trail Blazers'],
            ['143', 'Deandre Ayton', 'Portland Trail Blazers'],
            ['144', 'Shaedon Sharpe', 'Portland Trail Blazers'],
            ['145', 'Donovan Clingan', 'Portland Trail Blazers'],
            // Sacramento Kings
            ['146', 'De\'Aaron Fox', 'Sacramento Kings'],
            ['147', 'Domantas Sabonis', 'Sacramento Kings'],
            ['148', 'DeMar DeRozan', 'Sacramento Kings'],
            ['149', 'Keegan Murray', 'Sacramento Kings'],
            ['150', 'Malik Monk', 'Sacramento Kings'],
            // San Antonio Spurs
            ['151', 'Victor Wembanyama', 'San Antonio Spurs'],
            ['152', 'Devin Vassell', 'San Antonio Spurs'],
            ['153', 'Keldon Johnson', 'San Antonio Spurs'],
            ['154', 'Jeremy Sochan', 'San Antonio Spurs'],
            ['155', 'Tre Jones', 'San Antonio Spurs'],
            ['156', 'Stephon Castle', 'San Antonio Spurs'],
            // Toronto Raptors
            ['157', 'Scottie Barnes', 'Toronto Raptors'],
            ['158', 'RJ Barrett', 'Toronto Raptors'],
            ['159', 'Immanuel Quickley', 'Toronto Raptors'],
            ['160', 'Jakob Poeltl', 'Toronto Raptors'],
            ['161', 'Gradey Dick', 'Toronto Raptors'],
            // Utah Jazz
            ['162', 'Lauri Markkanen', 'Utah Jazz'],
            ['163', 'Collin Sexton', 'Utah Jazz'],
            ['164', 'Jordan Clarkson', 'Utah Jazz'],
            ['165', 'John Collins', 'Utah Jazz'],
            ['166', 'Walker Kessler', 'Utah Jazz'],
            ['167', 'Keyonte George', 'Utah Jazz'],
            // Washington Wizards
            ['168', 'Kyle Kuzma', 'Washington Wizards'],
            ['169', 'Jordan Poole', 'Washington Wizards'],
            ['170', 'Deni Avdija', 'Washington Wizards'],
            ['171', 'Bilal Coulibaly', 'Washington Wizards'],
            ['172', 'Alex Sarr', 'Washington Wizards'],
            // Legends / SP Base
            ['173', 'Michael Jordan', 'Chicago Bulls'],
            ['174', 'Kobe Bryant', 'Los Angeles Lakers'],
            ['175', 'Magic Johnson', 'Los Angeles Lakers'],
            ['176', 'Larry Bird', 'Boston Celtics'],
            ['177', 'Tim Duncan', 'San Antonio Spurs'],
            ['178', 'Shaquille O\'Neal', 'Los Angeles Lakers'],
            ['179', 'Hakeem Olajuwon', 'Houston Rockets'],
            ['180', 'Allen Iverson', 'Philadelphia 76ers'],
            ['181', 'Dirk Nowitzki', 'Dallas Mavericks'],
            ['182', 'Kevin Garnett', 'Minnesota Timberwolves'],
            ['183', 'Charles Barkley', 'Phoenix Suns'],
            ['184', 'Patrick Ewing', 'New York Knicks'],
            ['185', 'Scottie Pippen', 'Chicago Bulls'],
            ['186', 'John Stockton', 'Utah Jazz'],
            ['187', 'Karl Malone', 'Utah Jazz'],
            ['188', 'David Robinson', 'San Antonio Spurs'],
            ['189', 'Isiah Thomas', 'Detroit Pistons'],
            ['190', 'Dwyane Wade', 'Miami Heat'],
            // More current players to round out
            ['191', 'Devin Booker', 'Phoenix Suns'],
            ['192', 'Trae Young', 'Atlanta Hawks'],
            ['193', 'Ja Morant', 'Memphis Grizzlies'],
            ['194', 'Zion Williamson', 'New Orleans Pelicans'],
            ['195', 'LaMelo Ball', 'Charlotte Hornets'],
            ['196', 'Cade Cunningham', 'Detroit Pistons'],
            ['197', 'Evan Mobley', 'Cleveland Cavaliers'],
            ['198', 'Scottie Barnes', 'Toronto Raptors'],
            ['199', 'Paolo Banchero', 'Orlando Magic'],
            ['200', 'Victor Wembanyama', 'San Antonio Spurs']
        ];

        // Insert sets
        const inserts = [
            // 1985 Topps Basketball Tribute
            ['T-1', 'LeBron James', 'Los Angeles Lakers', '1985 Topps Tribute'],
            ['T-2', 'Stephen Curry', 'Golden State Warriors', '1985 Topps Tribute'],
            ['T-3', 'Kevin Durant', 'Phoenix Suns', '1985 Topps Tribute'],
            ['T-4', 'Giannis Antetokounmpo', 'Milwaukee Bucks', '1985 Topps Tribute'],
            ['T-5', 'Nikola Jokic', 'Denver Nuggets', '1985 Topps Tribute'],
            ['T-6', 'Luka Doncic', 'Dallas Mavericks', '1985 Topps Tribute'],
            ['T-7', 'Jayson Tatum', 'Boston Celtics', '1985 Topps Tribute'],
            ['T-8', 'Anthony Edwards', 'Minnesota Timberwolves', '1985 Topps Tribute'],
            ['T-9', 'Shai Gilgeous-Alexander', 'Oklahoma City Thunder', '1985 Topps Tribute'],
            ['T-10', 'Victor Wembanyama', 'San Antonio Spurs', '1985 Topps Tribute'],
            ['T-11', 'Joel Embiid', 'Philadelphia 76ers', '1985 Topps Tribute'],
            ['T-12', 'Donovan Mitchell', 'Cleveland Cavaliers', '1985 Topps Tribute'],
            ['T-13', 'Damian Lillard', 'Milwaukee Bucks', '1985 Topps Tribute'],
            ['T-14', 'Ja Morant', 'Memphis Grizzlies', '1985 Topps Tribute'],
            ['T-15', 'Chet Holmgren', 'Oklahoma City Thunder', '1985 Topps Tribute'],
            // Topps Now
            ['TN-1', 'Jayson Tatum', 'Boston Celtics', 'Topps Now'],
            ['TN-2', 'Shai Gilgeous-Alexander', 'Oklahoma City Thunder', 'Topps Now'],
            ['TN-3', 'Anthony Edwards', 'Minnesota Timberwolves', 'Topps Now'],
            ['TN-4', 'Luka Doncic', 'Dallas Mavericks', 'Topps Now'],
            ['TN-5', 'Victor Wembanyama', 'San Antonio Spurs', 'Topps Now'],
            ['TN-6', 'Nikola Jokic', 'Denver Nuggets', 'Topps Now'],
            ['TN-7', 'LeBron James', 'Los Angeles Lakers', 'Topps Now'],
            ['TN-8', 'Stephen Curry', 'Golden State Warriors', 'Topps Now'],
            ['TN-9', 'Giannis Antetokounmpo', 'Milwaukee Bucks', 'Topps Now'],
            ['TN-10', 'Cade Cunningham', 'Detroit Pistons', 'Topps Now'],
            // First Topps
            ['FT-1', 'Zaccharie Risacher', 'Atlanta Hawks', 'First Topps'],
            ['FT-2', 'Alex Sarr', 'Washington Wizards', 'First Topps'],
            ['FT-3', 'Reed Sheppard', 'Houston Rockets', 'First Topps'],
            ['FT-4', 'Stephon Castle', 'San Antonio Spurs', 'First Topps'],
            ['FT-5', 'Ron Holland II', 'Detroit Pistons', 'First Topps'],
            ['FT-6', 'Donovan Clingan', 'Portland Trail Blazers', 'First Topps'],
            ['FT-7', 'Tidjane Salaun', 'Charlotte Hornets', 'First Topps'],
            ['FT-8', 'Dalton Knecht', 'Los Angeles Lakers', 'First Topps'],
            ['FT-9', 'Matas Buzelis', 'Chicago Bulls', 'First Topps'],
            ['FT-10', 'Nikola Topic', 'Oklahoma City Thunder', 'First Topps'],
            ['FT-11', 'Zach Edey', 'Memphis Grizzlies', 'First Topps'],
            ['FT-12', 'Bronny James', 'Los Angeles Lakers', 'First Topps'],
            ['FT-13', 'Rob Dillingham', 'Minnesota Timberwolves', 'First Topps'],
            ['FT-14', 'Cody Williams', 'Utah Jazz', 'First Topps'],
            ['FT-15', 'Ja\'Kobe Walter', 'Toronto Raptors', 'First Topps'],
            // All-Star Showcase
            ['AS-1', 'LeBron James', 'Los Angeles Lakers', 'All-Star Showcase'],
            ['AS-2', 'Stephen Curry', 'Golden State Warriors', 'All-Star Showcase'],
            ['AS-3', 'Giannis Antetokounmpo', 'Milwaukee Bucks', 'All-Star Showcase'],
            ['AS-4', 'Kevin Durant', 'Phoenix Suns', 'All-Star Showcase'],
            ['AS-5', 'Nikola Jokic', 'Denver Nuggets', 'All-Star Showcase'],
            ['AS-6', 'Jayson Tatum', 'Boston Celtics', 'All-Star Showcase'],
            ['AS-7', 'Shai Gilgeous-Alexander', 'Oklahoma City Thunder', 'All-Star Showcase'],
            ['AS-8', 'Anthony Edwards', 'Minnesota Timberwolves', 'All-Star Showcase'],
            ['AS-9', 'Luka Doncic', 'Dallas Mavericks', 'All-Star Showcase'],
            ['AS-10', 'Donovan Mitchell', 'Cleveland Cavaliers', 'All-Star Showcase'],
        ];

        const cards = [];

        basePlayers.forEach(([num, player, team]) => {
            cards.push({
                id: generateId(),
                number: num,
                player,
                team,
                subset: 'Base',
                owned: false
            });
        });

        inserts.forEach(([num, player, team, subset]) => {
            cards.push({
                id: generateId(),
                number: num,
                player,
                team,
                subset,
                owned: false
            });
        });

        appData.sets.push({
            id: generateId(),
            name: '2025-26 Topps Flagship Basketball',
            sport: 'basketball',
            year: '2025-26',
            brand: 'Topps',
            cards,
            createdAt: new Date().toISOString()
        });

        saveData(appData);
    }

    // ===== EVENT LISTENERS =====
    function init() {
        // Seed default data
        seedTopps2025Basketball();
        appData = loadData();

        // Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('tab-' + tab.dataset.tab).classList.add('active');

                if (tab.dataset.tab === 'binder-view') {
                    renderBinderView();
                }
            });
        });

        // New set button
        document.getElementById('btn-new-set').addEventListener('click', openNewSetModal);
        document.getElementById('btn-create-set').addEventListener('click', createSet);
        document.getElementById('btn-cancel-set').addEventListener('click', () => hideModal('modal-new-set'));

        // CSV file upload
        document.getElementById('btn-browse-csv').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('csv-file').click();
        });

        document.getElementById('csv-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            handleFileUpload(file);
        });

        // File drag & drop
        const dropArea = document.getElementById('csv-upload-area');
        dropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropArea.classList.add('dragover');
        });
        dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) handleFileUpload(file);
        });

        // CSV paste
        document.getElementById('csv-paste').addEventListener('input', (e) => {
            const text = e.target.value.trim();
            if (text) handleCSVInput(text, null);
        });

        // Filters & search
        ['filter-sport', 'filter-year', 'filter-brand', 'sort-sets'].forEach(id => {
            document.getElementById(id).addEventListener('change', renderSetsGrid);
        });
        document.getElementById('search-sets').addEventListener('input', renderSetsGrid);

        // Set detail modal
        document.getElementById('btn-delete-set').addEventListener('click', deleteCurrentSet);
        document.getElementById('btn-add-cards').addEventListener('click', openAddCardsModal);
        document.getElementById('btn-import-more').addEventListener('click', importMoreCSV);
        document.getElementById('btn-close-detail').addEventListener('click', () => hideModal('modal-set-detail'));

        // Detail sorting
        document.querySelectorAll('#detail-card-table th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.sort;
                if (detailSortCol === col) {
                    detailSortDir = detailSortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    detailSortCol = col;
                    detailSortDir = 'asc';
                }
                renderDetailTable();
            });
        });

        // Detail filters
        ['detail-subset-filter', 'detail-show-filter'].forEach(id => {
            document.getElementById(id).addEventListener('change', renderDetailTable);
        });
        document.getElementById('detail-search').addEventListener('input', renderDetailTable);

        // Select all checkbox
        document.getElementById('detail-select-all').addEventListener('change', (e) => {
            const checked = e.target.checked;
            document.querySelectorAll('#detail-card-tbody .card-owned-toggle').forEach(cb => {
                const cardId = cb.dataset.cardId;
                const set = appData.sets.find(s => s.id === currentDetailSetId);
                if (set) {
                    const card = set.cards.find(c => c.id === cardId);
                    if (card) {
                        card.owned = checked;
                        cb.checked = checked;
                    }
                }
            });
            saveData(appData);
            renderDetailTable();
            renderSetsGrid();
        });

        // View in binder from detail
        document.getElementById('btn-binder-view-set').addEventListener('click', () => {
            hideModal('modal-set-detail');
            document.getElementById('binder-set-select').value = currentDetailSetId;
            // Switch to binder tab
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            document.querySelector('[data-tab="binder-view"]').classList.add('active');
            document.getElementById('tab-binder-view').classList.add('active');
            renderBinderView();
        });

        // Binder controls
        ['binder-set-select', 'binder-subset-select', 'binder-sort', 'binder-show'].forEach(id => {
            document.getElementById(id).addEventListener('change', renderBinderView);
        });

        // Add cards modal
        document.getElementById('btn-add-another-row').addEventListener('click', () => {
            document.getElementById('add-cards-rows').insertAdjacentHTML('beforeend', createAddCardRow());
        });
        document.getElementById('btn-save-cards').addEventListener('click', saveManualCards);

        // Remove row buttons (delegated)
        document.getElementById('add-cards-rows').addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove-row')) {
                const rows = document.querySelectorAll('#add-cards-rows .add-card-row');
                if (rows.length > 1) e.target.parentElement.remove();
            }
        });

        // Close modals via overlay or X button
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', hideAllModals);
        });
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').classList.add('hidden');
            });
        });

        // Keyboard ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideAllModals();
        });

        // Initial render
        populateFilterDropdowns();
        renderSetsGrid();
    }

    // Boot
    document.addEventListener('DOMContentLoaded', init);
})();
