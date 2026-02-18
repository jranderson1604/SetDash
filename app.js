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
        // NBA (current)
        'Atlanta Hawks', 'Boston Celtics', 'Brooklyn Nets', 'Charlotte Hornets',
        'Chicago Bulls', 'Cleveland Cavaliers', 'Dallas Mavericks', 'Denver Nuggets',
        'Detroit Pistons', 'Golden State Warriors', 'Houston Rockets', 'Indiana Pacers',
        'LA Clippers', 'Los Angeles Clippers', 'Los Angeles Lakers', 'Memphis Grizzlies',
        'Miami Heat', 'Milwaukee Bucks', 'Minnesota Timberwolves', 'New Orleans Pelicans',
        'New York Knicks', 'Oklahoma City Thunder', 'Orlando Magic', 'Philadelphia 76ers',
        'Phoenix Suns', 'Portland Trail Blazers', 'Sacramento Kings', 'San Antonio Spurs',
        'Toronto Raptors', 'Utah Jazz', 'Washington Wizards',
        // NBA (historical/retired)
        'Seattle SuperSonics', 'Seattle Supersonics', 'Vancouver Grizzlies',
        'New Jersey Nets', 'Charlotte Bobcats', 'Washington Bullets',
        'San Diego Clippers', 'Kansas City Kings', 'St. Louis Hawks',
        'Cincinnati Royals', 'Baltimore Bullets', 'New Orleans Hornets',
        'New Orleans/Oklahoma City Hornets',
        // MLB
        'Arizona Diamondbacks', 'Atlanta Braves', 'Baltimore Orioles', 'Boston Red Sox',
        'Chicago Cubs', 'Chicago White Sox', 'Cincinnati Reds', 'Cleveland Guardians',
        'Colorado Rockies', 'Detroit Tigers', 'Houston Astros', 'Kansas City Royals',
        'Los Angeles Angels', 'Los Angeles Dodgers', 'Miami Marlins', 'Milwaukee Brewers',
        'Minnesota Twins', 'New York Mets', 'New York Yankees', 'Oakland Athletics',
        'Philadelphia Phillies', 'Pittsburgh Pirates', 'San Diego Padres',
        'San Francisco Giants', 'Seattle Mariners', 'St. Louis Cardinals',
        'Tampa Bay Rays', 'Texas Rangers', 'Toronto Blue Jays', 'Washington Nationals',
        'Cleveland Indians', 'Montreal Expos', 'Florida Marlins',
        // NFL
        'Arizona Cardinals', 'Atlanta Falcons', 'Baltimore Ravens', 'Buffalo Bills',
        'Carolina Panthers', 'Chicago Bears', 'Cincinnati Bengals', 'Cleveland Browns',
        'Dallas Cowboys', 'Denver Broncos', 'Detroit Lions', 'Green Bay Packers',
        'Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars', 'Kansas City Chiefs',
        'Las Vegas Raiders', 'Los Angeles Chargers', 'Los Angeles Rams', 'Miami Dolphins',
        'Minnesota Vikings', 'New England Patriots', 'New Orleans Saints', 'New York Giants',
        'New York Jets', 'Philadelphia Eagles', 'Pittsburgh Steelers', 'San Francisco 49ers',
        'Seattle Seahawks', 'Tampa Bay Buccaneers', 'Tennessee Titans', 'Washington Commanders',
        'Oakland Raiders', 'San Diego Chargers', 'St. Louis Rams', 'Washington Redskins',
        'Washington Football Team',
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
        text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Try comma-delimited format first: "number player, team [RC]"
        const commaRegex = new RegExp(
            '(\\d+)\\s+' +                    // card number
            '([^,]+?),\\s*' +                  // player name (up to comma)
            '(' + TEAM_PATTERN + ')' +          // team name
            '(?:\\s+RC)?',                      // optional RC designation
            'gi'
        );

        let allMatches = [];
        let match;
        while ((match = commaRegex.exec(text)) !== null) {
            allMatches.push({
                index: match.index,
                endIndex: match.index + match[0].length,
                number: match[1].trim(),
                player: match[2].trim(),
                team: match[3].trim()
            });
        }

        // Fall back to space-only format: "number player team" (no commas)
        if (allMatches.length === 0) {
            const spaceRegex = new RegExp(
                '(\\d+)\\s+' +
                '(.+?)\\s+' +
                '(' + TEAM_PATTERN + ')',
                'gi'
            );
            while ((match = spaceRegex.exec(text)) !== null) {
                allMatches.push({
                    index: match.index,
                    endIndex: match.index + match[0].length,
                    number: match[1].trim(),
                    player: match[2].trim(),
                    team: match[3].trim()
                });
            }
        }

        if (allMatches.length === 0) return [];

        // Build cards with subset detection from gap text between matches
        let currentSubset = 'Base';
        const cards = [];

        for (let i = 0; i < allMatches.length; i++) {
            const m = allMatches[i];

            // Check text between this card and previous for subset headers
            const prevEnd = i > 0 ? allMatches[i - 1].endIndex : 0;
            const gapText = text.substring(prevEnd, m.index);
            const newSubset = detectSubsetFromGap(gapText);
            if (newSubset) currentSubset = newSubset;

            // Skip junk matches (player name is just digits)
            if (!m.player || /^\d+$/.test(m.player)) continue;

            cards.push({
                id: generateId(),
                number: m.number,
                player: m.player,
                team: m.team,
                subset: currentSubset,
                owned: false
            });
        }

        return cards;
    }

    function detectSubsetFromGap(gapText) {
        if (!gapText || gapText.trim().length === 0) return null;

        let text = gapText.trim();

        // Remove everything after first "*" (parallel/odds bullet points)
        text = text.replace(/\*[\s\S]*$/, '');
        // Remove card count patterns: "300 cards", "30 cards"
        text = text.replace(/\d+\s+cards?\b/gi, '');
        // Remove pack odds: "1:5002 packs (Hobby exclusive)"
        text = text.replace(/\d+:\d[\d,]*\s*packs?[^)]*(\))?/gi, '');
        // Remove "Parallels" and "Checklist"
        text = text.replace(/\bParallels?\b/gi, '');
        text = text.replace(/\bChecklist\b/gi, '');
        // Remove parenthetical content
        text = text.replace(/\([^)]*\)/g, '');
        // Clean whitespace
        text = text.replace(/\s+/g, ' ').trim();

        if (!text || text.length < 2) return null;

        // "Base Set" or "Base" → normalize to "Base"
        if (/^base(\s+set)?$/i.test(text)) return 'Base';

        return text;
    }

    // Test whether text looks like a Beckett checklist (not CSV)
    function looksLikeBeckettChecklist(text) {
        // If it has commas separating fields with a proper CSV header row, it's CSV
        const firstLine = text.trim().split(/\r?\n/)[0] || '';
        if (/,/.test(firstLine)) {
            const fields = parseCSVLine(firstLine);
            if (fields.length >= 2) {
                const lower = fields.map(f => f.trim().toLowerCase());
                if (lower.some(f => /^(card|#|number|player|name|team)/.test(f))) {
                    return false; // Proper CSV header
                }
            }
        }

        // Check for Beckett patterns: "number player, team" or "number player team"
        const commaTest = new RegExp('\\d+\\s+[^,]+,\\s*(' + TEAM_PATTERN + ')', 'i');
        if (commaTest.test(text)) return true;

        const spaceTest = new RegExp('\\d+\\s+\\S+.*?\\s+(' + TEAM_PATTERN + ')', 'i');
        return spaceTest.test(text);
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
        if (appData.sets.some(s => s.name === '2025-26 Topps Flagship Basketball')) return;

        // Real checklist from Beckett - parsed using our Beckett parser
        const checklist = `Base Set
300 cards
1 Jayson Tatum, Boston Celtics
2 Jaylen Brown, Boston Celtics
3 Kristaps Porzingis, Boston Celtics
4 Payton Pritchard, Boston Celtics
5 Baylor Scheierman, Boston Celtics
6 Derrick White, Boston Celtics
7 Jrue Holiday, Boston Celtics
8 D'Angelo Russell, Brooklyn Nets
9 Ziaire Williams, Brooklyn Nets
10 Nic Claxton, Brooklyn Nets
11 Cam Thomas, Brooklyn Nets
12 Jalen Wilson, Brooklyn Nets
13 Cameron Johnson, Brooklyn Nets
14 Jalen Brunson, New York Knicks
15 OG Anunoby, New York Knicks
16 Josh Hart, New York Knicks
17 Miles McBride, New York Knicks
18 Mikal Bridges, New York Knicks
19 Karl-Anthony Towns, New York Knicks
20 Tyler Kolek, New York Knicks
21 Tyrese Maxey, Philadelphia 76ers
22 Joel Embiid, Philadelphia 76ers
23 Paul George, Philadelphia 76ers
24 Jared McCain, Philadelphia 76ers
25 Quentin Grimes, Philadelphia 76ers
26 Guerschon Yabusele, Philadelphia 76ers
27 Kelly Oubre Jr., Philadelphia 76ers
28 Gradey Dick, Toronto Raptors
29 Jonathan Mogbo, Toronto Raptors
30 Brandon Ingram, Toronto Raptors
31 Scottie Barnes, Toronto Raptors
32 Immanuel Quickley, Toronto Raptors
33 RJ Barrett, Toronto Raptors
34 Coby White, Chicago Bulls
35 Josh Giddey, Chicago Bulls
36 Nikola Vucevic, Chicago Bulls
37 Matas Buzelis, Chicago Bulls
38 Patrick Williams, Chicago Bulls
39 Lonzo Ball, Chicago Bulls
40 Cade Cunningham, Detroit Pistons
41 Jalen Duren, Detroit Pistons
42 Ron Holland II, Detroit Pistons
43 Malik Beasley, Detroit Pistons
44 Ausar Thompson, Detroit Pistons
45 Jaden Ivey, Detroit Pistons
46 Marcus Sasser, Detroit Pistons
47 Tyrese Haliburton, Indiana Pacers
48 Bennedict Mathurin, Indiana Pacers
49 Myles Turner, Indiana Pacers
50 Jarace Walker, Indiana Pacers
51 Obi Toppin, Indiana Pacers
52 Andrew Nembhard, Indiana Pacers
53 Pascal Siakam, Indiana Pacers
54 Giannis Antetokounmpo, Milwaukee Bucks
55 Damian Lillard, Milwaukee Bucks
56 Kyle Kuzma, Milwaukee Bucks
57 AJ Green, Milwaukee Bucks
58 Brook Lopez, Milwaukee Bucks
59 Gary Trent Jr., Milwaukee Bucks
60 Tyler Smith, Milwaukee Bucks
61 Trae Young, Atlanta Hawks
62 Zaccharie Risacher, Atlanta Hawks
63 Clint Capela, Atlanta Hawks
64 Dyson Daniels, Atlanta Hawks
65 Jalen Johnson, Atlanta Hawks
66 Onyeka Okongwu, Atlanta Hawks
67 LaMelo Ball, Charlotte Hornets
68 Brandon Miller, Charlotte Hornets
69 Miles Bridges, Charlotte Hornets
70 Mark Williams, Charlotte Hornets
71 Tidjane Salaun, Charlotte Hornets
72 Nick Smith Jr., Charlotte Hornets
73 Tyler Herro, Miami Heat
74 Kel'el Ware, Miami Heat
75 Bam Adebayo, Miami Heat
76 Nikola Jovic, Miami Heat
77 Andrew Wiggins, Miami Heat
78 Jaime Jaquez Jr., Miami Heat
79 Pelle Larsson, Miami Heat
80 Donovan Mitchell, Cleveland Cavaliers
81 Darius Garland, Cleveland Cavaliers
82 Evan Mobley, Cleveland Cavaliers
83 Ty Jerome, Cleveland Cavaliers
84 Max Strus, Cleveland Cavaliers
85 Jarrett Allen, Cleveland Cavaliers
86 Jaylon Tyson, Cleveland Cavaliers
87 Paolo Banchero, Orlando Magic
88 Franz Wagner, Orlando Magic
89 Anthony Black, Orlando Magic
90 Wendell Carter Jr., Orlando Magic
91 Cole Anthony, Orlando Magic
92 Jalen Suggs, Orlando Magic
93 Tristan da Silva, Orlando Magic
94 Jordan Poole, Washington Wizards
95 Bilal Coulibaly, Washington Wizards
96 Alex Sarr, Washington Wizards
97 Bub Carrington, Washington Wizards
98 Kyshawn George, Washington Wizards
99 AJ Johnson, Washington Wizards
100 Khris Middleton, Washington Wizards
101 Nikola Jokic, Denver Nuggets
102 Christian Braun, Denver Nuggets
103 Jamal Murray, Denver Nuggets
104 Russell Westbrook, Denver Nuggets
105 Michael Porter Jr., Denver Nuggets
106 Peyton Watson, Denver Nuggets
107 Jalen Pickett, Denver Nuggets
108 Anthony Edwards, Minnesota Timberwolves
109 Naz Reid, Minnesota Timberwolves
110 Julius Randle, Minnesota Timberwolves
111 Rudy Gobert, Minnesota Timberwolves
112 Mike Conley, Minnesota Timberwolves
113 Terrence Shannon Jr., Minnesota Timberwolves
114 Rob Dillingham, Minnesota Timberwolves
115 Shai Gilgeous-Alexander, Oklahoma City Thunder
116 Jalen Williams, Oklahoma City Thunder
117 Luguentz Dort, Oklahoma City Thunder
118 Chet Holmgren, Oklahoma City Thunder
119 Cason Wallace, Oklahoma City Thunder
120 Isaiah Hartenstein, Oklahoma City Thunder
121 Isaiah Joe, Oklahoma City Thunder
122 Scoot Henderson, Portland Trail Blazers
123 Anfernee Simons, Portland Trail Blazers
124 Deandre Ayton, Portland Trail Blazers
125 Deni Avdija, Portland Trail Blazers
126 Donovan Clingan, Portland Trail Blazers
127 Shaedon Sharpe, Portland Trail Blazers
128 Toumani Camara, Portland Trail Blazers
129 Lauri Markkanen, Utah Jazz
130 Cody Williams, Utah Jazz
131 Keyonte George, Utah Jazz
132 Jordan Clarkson, Utah Jazz
133 Isaiah Collier, Utah Jazz
134 Kyle Filipowski, Utah Jazz
135 Stephen Curry, Golden State Warriors
136 Jimmy Butler III, Golden State Warriors
137 Draymond Green, Golden State Warriors
138 Jonathan Kuminga, Golden State Warriors
139 Quinten Post, Golden State Warriors
140 Moses Moody, Golden State Warriors
141 Brandin Podziemski, Golden State Warriors
142 Kawhi Leonard, Los Angeles Clippers
143 James Harden, Los Angeles Clippers
144 Norman Powell, Los Angeles Clippers
145 Ivica Zubac, Los Angeles Clippers
146 Nicolas Batum, Los Angeles Clippers
147 Ben Simmons, Los Angeles Clippers
148 Derrick Jones Jr., Los Angeles Clippers
149 Dorian Finney-Smith, Los Angeles Lakers
150 LeBron James, Los Angeles Lakers
151 Austin Reaves, Los Angeles Lakers
152 Bronny James Jr., Los Angeles Lakers
153 Dalton Knecht, Los Angeles Lakers
154 Rui Hachimura, Los Angeles Lakers
155 Jarred Vanderbilt, Los Angeles Lakers
156 Devin Booker, Phoenix Suns
157 Kevin Durant, Houston Rockets
158 Bradley Beal, Phoenix Suns
159 Ryan Dunn, Phoenix Suns
160 Oso Ighodaro, Phoenix Suns
161 Grayson Allen, Phoenix Suns
162 DeMar DeRozan, Sacramento Kings
163 Zach LaVine, Sacramento Kings
164 Malik Monk, Sacramento Kings
165 Devin Carter, Sacramento Kings
166 Keegan Murray, Sacramento Kings
167 Domantas Sabonis, Sacramento Kings
168 Kyrie Irving, Dallas Mavericks
169 Anthony Davis, Dallas Mavericks
170 Klay Thompson, Dallas Mavericks
171 Brandon Williams, Dallas Mavericks
172 Dereck Lively II, Dallas Mavericks
173 P.J. Washington Jr., Dallas Mavericks
174 Max Christie, Dallas Mavericks
175 Jalen Green, Houston Rockets
176 Amen Thompson, Houston Rockets
177 Jabari Smith Jr., Houston Rockets
178 Reed Sheppard, Houston Rockets
179 Tari Eason, Houston Rockets
180 Alperen Sengun, Houston Rockets
181 Dillon Brooks, Houston Rockets
182 Ja Morant, Memphis Grizzlies
183 Jaylen Wells, Memphis Grizzlies
184 Jaren Jackson Jr., Memphis Grizzlies
185 Desmond Bane, Memphis Grizzlies
186 Zach Edey, Memphis Grizzlies
187 Santi Aldama, Memphis Grizzlies
188 Yuki Kawamura, Memphis Grizzlies
189 Herbert Jones, New Orleans Pelicans
190 Trey Murphy III, New Orleans Pelicans
191 Yves Missi, New Orleans Pelicans
192 Dejounte Murray, New Orleans Pelicans
193 CJ McCollum, New Orleans Pelicans
194 Jordan Hawkins, New Orleans Pelicans
195 Victor Wembanyama, San Antonio Spurs
196 De'Aaron Fox, San Antonio Spurs
197 Stephon Castle, San Antonio Spurs
198 Chris Paul, San Antonio Spurs
199 Jeremy Sochan, San Antonio Spurs
200 Keldon Johnson, San Antonio Spurs
201 Cooper Flagg, Dallas Mavericks
202 Dylan Harper, San Antonio Spurs
203 VJ Edgecombe, Philadelphia 76ers
204 Kon Knueppel, Charlotte Hornets
205 Ace Bailey, Utah Jazz
206 Tre Johnson III, Washington Wizards
207 Jeremiah Fears, New Orleans Pelicans
208 Egor Demin, Brooklyn Nets
209 Collin Murray-Boyles, Toronto Raptors
210 Khaman Maluach, Phoenix Suns
211 Cedric Coward, Memphis Grizzlies
212 Noa Essengue, Chicago Bulls
213 Derik Queen, New Orleans Pelicans
214 Carter Bryant, San Antonio Spurs
215 Thomas Sorber, Oklahoma City Thunder
216 Yang Hansen, Portland Trail Blazers
217 Joan Beringer, Minnesota Timberwolves
218 Walter Clayton Jr., Utah Jazz
219 Nolan Traore, Brooklyn Nets
220 Kasparas Jakucionis, Miami Heat
221 Will Riley, Washington Wizards
222 Drake Powell, Brooklyn Nets
223 Asa Newell, Atlanta Hawks
224 Nique Clifford, Sacramento Kings
225 Jase Richardson, Orlando Magic
226 Ben Saraf, Brooklyn Nets
227 Danny Wolf, Brooklyn Nets
228 Hugo Gonzalez, Boston Celtics
229 Liam McNeeley, Charlotte Hornets
230 Yanic Konan-Niederhauser, Los Angeles Clippers
231 Rasheer Fleming, Phoenix Suns
232 Noah Penda, Orlando Magic
233 Sion James, Charlotte Hornets
234 Ryan Kalkbrenner, Charlotte Hornets
235 Johni Broome, Philadelphia 76ers
236 Adou Thiero, Los Angeles Lakers
237 Buddy Hield, Golden State Warriors
238 Chaz Lanier, Detroit Pistons
239 Kam Jones, Indiana Pacers
240 Alijah Martin, Toronto Raptors
241 Micah Peavy, New Orleans Pelicans
242 Koby Brea, Phoenix Suns
243 Maxime Raynaud, Sacramento Kings
244 Jamir Watkins, Washington Wizards
245 Brooks Barnhizer, Oklahoma City Thunder
246 Naji Marshall, Dallas Mavericks
247 Ochai Agbaji, Toronto Raptors
248 Jaden McDaniels, Minnesota Timberwolves
249 GG Jackson II, Memphis Grizzlies
250 Tyrese Proctor, Cleveland Cavaliers
251 Bill Russell, Boston Celtics
252 Dirk Nowitzki, Dallas Mavericks
253 Allen Iverson, Philadelphia 76ers
254 Kevin Garnett, Minnesota Timberwolves
255 Magic Johnson, Los Angeles Lakers
256 Carmelo Anthony, Denver Nuggets
257 Larry Bird, Boston Celtics
258 Rick Barry, Golden State Warriors
259 Kareem Abdul-Jabbar, Milwaukee Bucks
260 Shaquille O'Neal, Orlando Magic
261 Dwyane Wade, Miami Heat
262 Manu Ginobili, San Antonio Spurs
263 Tracy McGrady, Houston Rockets
264 John Stockton, Utah Jazz
265 George Gervin, San Antonio Spurs
266 Spud Webb, Atlanta Hawks
267 Steve Kerr, San Antonio Spurs
268 Bernard King, New York Knicks
269 Isiah Thomas, Detroit Pistons
270 Detlef Schrempf, Seattle Supersonics
Combo Cards
30 cards
271 Paolo Banchero, Orlando Magic
272 Jayson Tatum, Boston Celtics
273 Cameron Johnson, Brooklyn Nets
274 Jalen Brunson, New York Knicks
275 Jared McCain, Philadelphia 76ers
276 RJ Barrett, Toronto Raptors
277 Josh Giddey, Chicago Bulls
278 Donovan Mitchell, Cleveland Cavaliers
279 Cade Cunningham, Detroit Pistons
280 Tyrese Haliburton, Indiana Pacers
281 Giannis Antetokounmpo, Milwaukee Bucks
282 Trae Young, Atlanta Hawks
283 Brandon Miller, Charlotte Hornets
284 Tyler Herro, Miami Heat
285 Alex Sarr, Washington Wizards
286 Nikola Jokic, Denver Nuggets
287 Anthony Edwards, Minnesota Timberwolves
288 Shai Gilgeous-Alexander, Oklahoma City Thunder
289 Shaedon Sharpe, Portland Trail Blazers
290 Kyle Filipowski, Utah Jazz
291 Stephen Curry, Golden State Warriors
292 James Harden, Los Angeles Clippers
293 Austin Reaves, Los Angeles Lakers
294 Devin Booker, Phoenix Suns
295 Zach Lavine, Sacramento Kings
296 Anthony Davis, Dallas Mavericks
297 Amen Thompson, Houston Rockets
298 Ja Morant, Memphis Grizzlies
299 Trey Murphy III, New Orleans Pelicans
300 Victor Wembanyama, San Antonio Spurs
Base \u2013 Player Number Variation
25 cards
1 Jayson Tatum, Boston Celtics
14 Jalen Brunson, New York Knicks
24 Jared McCain, Philadelphia 76ers
40 Cade Cunningham, Detroit Pistons
47 Tyrese Haliburton, Indiana Pacers
54 Giannis Antetokounmpo, Milwaukee Bucks
61 Trae Young, Atlanta Hawks
67 LaMelo Ball, Charlotte Hornets
73 Tyler Herro, Miami Heat
80 Donovan Mitchell, Cleveland Cavaliers
87 Paolo Banchero, Orlando Magic
101 Nikola Jokic, Denver Nuggets
108 Anthony Edwards, Minnesota Timberwolves
115 Shai Gilgeous-Alexander, Oklahoma City Thunder
116 Jalen Williams, Oklahoma City Thunder
122 Scoot Henderson, Portland Trail Blazers
135 Stephen Curry, Golden State Warriors
142 Kawhi Leonard, Los Angeles Clippers
150 LeBron James, Los Angeles Lakers
156 Devin Booker, Phoenix Suns
157 Kevin Durant, Houston Rockets
168 Kyrie Irving, Dallas Mavericks
176 Amen Thompson, Houston Rockets
182 Ja Morant, Memphis Grizzlies
195 Victor Wembanyama, San Antonio Spurs`;

        const cards = parseBeckettChecklist(checklist);

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
