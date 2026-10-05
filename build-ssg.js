const fs = require('node:fs/promises');
const path = require('node:path');

const SITE_ORIGIN = 'https://fowtcgcardsearch.github.io/card-search';
const ROOT_DIR = __dirname;
const CARD_OUTPUT_DIR = path.join(ROOT_DIR, 'card');
const CARD_DATA_PATH = path.join(ROOT_DIR, 'data', 'cards.json');
const MASTER_DATA_PATH = path.join(ROOT_DIR, 'data', 'master.json');

function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function asText(value) {
	return Array.isArray(value) ? value.join(' / ') : (value ?? '');
}

function asList(value) {
	if (Array.isArray(value)) return value.filter(Boolean);
	return value ? [value] : [];
}

function makeCardHref(card) {
	return `./${encodeURIComponent(card.id)}.html`;
}

function makeCardHrefMap(cards, latestCardMap = {}) {
	const cardByUid = new Map(cards.map((card) => [card.uid, card]));
	const hrefByName = new Map();
	const setCardNames = (card, href = makeCardHref(card)) => {
		if (card.enName) hrefByName.set(card.enName, href);
		if (card.jpName) hrefByName.set(card.jpName, href);
	};

	cards.forEach((card) => {
		if (card.id) setCardNames(card);
	});
	Object.entries(latestCardMap).forEach(([name, uid]) => {
		const latestCard = cardByUid.get(uid);
		if (latestCard?.id) {
			setCardNames(latestCard);
			hrefByName.set(name, makeCardHref(latestCard));
		}
	});
	return hrefByName;
}

function makeSearchLink(type, value, displayName) {
	if (!value) return escapeHtml(displayName || '-');
	const href = `../?property=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}`;
	return `<a class="link-btn" href="${escapeHtml(href)}">${escapeHtml(displayName || value)}</a>`;
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeLinkedCardText(text, keywords, cardHrefByName) {
	const cardLinkPlaceholders = new Map();
	let placeholderIndex = 0;
	let processedText = String(text || '');
	processedText = processedText.replace(/(「|『|"|“)([^「」『』"“”]+)(」|』|"|”)/g, (match, open, rawName, close) => {
		const name = rawName.trim();
		const href = cardHrefByName.get(name);
		if (!href) return match;
		const placeholder = `__CARD_LINK_${placeholderIndex++}__`;
		const prefix = rawName.match(/^\s*/)[0];
		const suffix = rawName.match(/\s*$/)[0];
		cardLinkPlaceholders.set(placeholder, `${escapeHtml(open)}${escapeHtml(prefix)}<a class="link-btn" href="${escapeHtml(href)}" title="カード詳細を見る">${escapeHtml(name)}</a>${escapeHtml(suffix)}${escapeHtml(close)}`);
		return placeholder;
	});
	processedText = escapeHtml(processedText);

	const keywordList = Array.isArray(keywords) ? [...keywords].sort((a, b) => (b.name || '').length - (a.name || '').length) : [];
	for (const keyword of keywordList) {
		const matchEn = String(keyword.name || '').match(/^(\[[^\]]+\])/);
		if (!matchEn) continue;
		const patterns = [matchEn[1]];
		if (keyword.jp) {
			const matchJp = String(keyword.jp).trim().match(/^(\[[^\]]+\])/);
			patterns.push(matchJp ? matchJp[1] : String(keyword.jp).trim());
		}
		for (const pattern of patterns) {
			if (!pattern) continue;
			const regex = new RegExp(escapeRegExp(escapeHtml(pattern)), 'g');
			processedText = processedText.replace(regex, (match) => `<span class="keyword-tooltip" tabindex="0" data-tooltip="${escapeHtml(keyword.description)}">${match}</span>`);
		}
	}
	for (const [placeholder, link] of cardLinkPlaceholders) {
		processedText = processedText.replace(placeholder, link);
	}
	return processedText;
}

function makeDetailText(text, fallback, keywords, cardHrefByName, lang, textStyle) {
	const source = text || fallback;
	const soloModeIndex = source.search(/\[Solo Mode\]/i);
	const renderText = (value) => makeLinkedCardText(value, keywords, cardHrefByName);
	const styleAttribute = textStyle ? ` style="${textStyle}"` : '';

	if (soloModeIndex === -1) {
		return `<div class="text-block" lang="${lang}"${styleAttribute}>${renderText(source)}</div>`;
	}

	const regularText = source.slice(0, soloModeIndex).trimEnd();
	const soloModeText = source.slice(soloModeIndex + '[Solo Mode]'.length).trim();
	return `${regularText ? `<div class="text-block" lang="${lang}"${styleAttribute}>${renderText(regularText)}</div>` : ''}
		<div style="display:flex; align-items:stretch; overflow:hidden; margin-bottom:8px; border:3px solid #D3D3D3; background:#D3D3D3;">
			<div style="display:flex; align-items:center; justify-content:center; flex:0 0 24px; padding:6px 2px; background:#171717; color:#fff; font-size:11px; font-weight:bold; writing-mode:vertical-rl; transform:rotate(180deg);">Solo Mode</div>
			<div class="text-block" lang="${lang}" style="flex:1; margin:0; border:0; border-radius:0; background:transparent;${textStyle ? ` ${textStyle};` : ''}">${renderText(soloModeText)}</div>
		</div>`;
}

function makeAttributeBadges(values) {
	return asList(values).map((value) => {
		const attribute = String(value).trim();
		const badgeClass = ['光', '炎', '水', '風', '闇'].includes(attribute) ? `attri-${attribute}` : 'attri-default';
		return `<span class="badge ${badgeClass}">${escapeHtml(attribute)}</span>`;
	}).join('') || '-';
}

function makeCostBadges(cost) {
	if (!cost || cost === '-') return '-';
	const parts = String(cost).match(/光|炎|水|風|闇|月|時|無|X|\d+/g) || String(cost).split('');
	return parts.map((part) => {
		const badgeClass = ['光', '炎', '水', '風', '闇', '月', '時', '無', 'X'].includes(part) ? `cost-${part}` : 'cost-default';
		return `<span class="badge-cost ${badgeClass}">${escapeHtml(part)}</span>`;
	}).join('');
}

function makeStatusSection(card) {
	const statuses = [
		['神力', card.divinity],
		['ウィルパワー', card.willpower],
		['ATK', card.atk],
		['DEF', card.def]
	].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim() !== '-');
	if (!statuses.length) return '';

	return `<section class="modal-section">
		<div class="modal-section-title">ステータス</div>
		<div class="grid-status">${statuses.map(([label, value]) => `<div class="status-box"><div>${label}</div><div class="status-val">${escapeHtml(value)}</div></div>`).join('')}</div>
	</section>`;
}

function makeDescription(card) {
	const attributes = asText(card.attris) || 'なし';
	const cost = card.cost || 'なし';
	const types = asText(card.types) || 'なし';
	const text = card.jpText || card.enText || 'テキストなし';
	return `${card.jpName}。属性: ${attributes}、コスト: ${cost}、タイプ: ${types}。${text}`;
}

function makeCardDetailHtml(card, cards, keywords, cardHrefByName, cardReferenceMap, latestCardMap, cardByUid, raceMap) {
	const types = asList(card.types).map(escapeHtml).join('・') || '-';
	const races = asList(card.races).map((value) => {
		const raceName = String(value).trim();
		const displayName = raceMap[raceName] ? `${raceName}(${raceMap[raceName]})` : raceName;
		return makeSearchLink('race', raceName, displayName);
	}).join('・');
	const typeAndRace = races ? `${types} - ${races}` : types;
	const flavors = [
		card.enFlavor && card.enFlavor !== '-' ? `<div class="flavor-block" style="color:#64748b;">${escapeHtml(card.enFlavor)}</div>` : '',
		card.jpFlavor && card.jpFlavor !== '-' ? `<div class="flavor-block">${escapeHtml(card.jpFlavor)}</div>` : '',
		!card.jpFlavor && card.transFlavor && card.transFlavor !== '-' ? `<div style="margin-top: 6px; font-size: 12px; color: #0284c7;"><span class="keyword-tooltip" tabindex="0" data-tooltip="${escapeHtml(card.transFlavor)}" style="cursor: pointer; text-decoration: underline dotted;">自動翻訳を表示</span></div>` : ''
	].filter(Boolean).join('');
	const flavorSection = flavors ? `<section class="modal-section"><div class="modal-section-title">フレイバーテキスト</div>${flavors}</section>` : '';
	const reprints = cards.filter((other) => other.enName === card.enName && other.id !== card.id);
	const reprintSection = reprints.length ? `<section class="modal-section">
		<div class="modal-section-title">再録情報 (他の収録弾)</div>
		<div style="border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden;">${reprints.map((other) => `<div style="padding: 4px 8px; border-bottom: 1px solid #f1f5f9;"><a class="link-btn" href="${escapeHtml(makeCardHref(other))}">${escapeHtml(other.expansion || '')} : ${escapeHtml(other.id)}</a></div>`).join('')}</div>
	</section>` : '';
	const referenceItems = asList(cardReferenceMap[card.enName]).map((refInfo) => {
		const refUid = latestCardMap[refInfo.enName] || refInfo.uid;
		const refCard = cardByUid.get(refUid);
		if (!refCard?.id) return '';
		const displayName = refCard.jpName ? `${refCard.enName} (${refCard.jpName})` : refCard.enName;
		return `<div style="padding: 6px 8px; border-bottom: 1px solid #f1f5f9;"><a class="link-btn" href="${escapeHtml(makeCardHref(refCard))}">${escapeHtml(displayName)}</a></div>`;
	}).filter(Boolean).join('');
	const referenceSection = referenceItems ? `<section class="modal-section">
		<div class="modal-section-title">このカードを参照しているカード</div>
		<div style="border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; max-height: 150px; overflow-y: auto;">${referenceItems}</div>
	</section>` : '';
	const banItems = asList(card.bans).map((ban) => {
		const pairHref = ban.pair && cardHrefByName.get(ban.pair);
		const pairLabel = pairHref
			? `<a class="link-btn" href="${escapeHtml(pairHref)}">${escapeHtml(ban.pair)}</a>`
			: escapeHtml(ban.pair);
		const pairText = ban.type === 'コンビ禁止' && ban.pair ? ` (コンビ先: ${pairLabel})` : '';
		return `<div style="padding: 4px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13px;"><span class="ban-badge ban-type-${escapeHtml(ban.type)}">${escapeHtml(ban.type)}</span> <strong>${escapeHtml(ban.format)}</strong>${pairText}</div>`;
	}).join('');
	const banSection = banItems ? `<section class="modal-section" style="border-left: 3px solid #ef4444;"><div class="modal-section-title" style="color: #dc2626;">禁止情報</div>${banItems}</section>` : '';
	const illustratorLinks = asList(card.illustrators).map((illustrator) => makeSearchLink('illustrator', illustrator, illustrator)).join('・') || '-';
	const textEn = makeDetailText(card.enText, '(No text available)', keywords, cardHrefByName, 'en', 'color:#475569; font-size:12px;');
	const textJp = makeDetailText(card.jpText, '（効果テキストなし）', keywords, cardHrefByName, 'ja', 'color:#0f172a; font-weight:500;');

	return `
		<header class="modal-title">
			<h2 style="margin: 0; font-size: 20px; color: #1e293b;">${escapeHtml(card.enName || '（No English Name）')}</h2>
			<p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px; font-weight: bold;">${escapeHtml(card.jpName || '')}</p>
		</header>
		<section class="modal-section">
			<div style="font-size: 14px; margin-bottom: 10px;">
				<div style="margin-bottom: 4px;"><strong>属性:</strong> ${makeAttributeBadges(card.attris)}</div>
				<div style="margin-bottom: 4px;"><strong>コスト:</strong> ${makeCostBadges(card.cost)}</div>
				<div><strong>カードタイプ - 種族:</strong> ${typeAndRace}</div>
			</div>
		</section>
		${makeStatusSection(card)}
		<section class="modal-section">
			<div class="modal-section-title">テキスト</div>
			${textEn}
			${textJp}
		</section>
		${flavorSection}
		<section class="modal-section">
			<div class="modal-section-title">収録弾情報</div>
			<div style="font-size: 13px; line-height: 1.8;">
				<div><strong>収録弾:</strong> ${makeSearchLink('exp', card.expansionCode, card.expansion || card.expansionCode)}</div>
				${card.expansionJp ? `<div><strong>日本語名称:</strong> ${escapeHtml(card.expansionJp)}</div>` : ''}
				<div><strong>No:</strong> ${escapeHtml(card.id || '-')}</div>
				<div><strong>レアリティ:</strong> ${escapeHtml(card.rarity || '-')}</div>
				<div><strong>イラストレーター:</strong> ${illustratorLinks}</div>
			</div>
		</section>
		${reprintSection}
		${referenceSection}
		${banSection}
		<section class="modal-section">
			<div class="modal-section-title">外部サイト</div>
			<div style="margin-top: 20px;"><a href="https://www.forceofwind.online/card/${encodeURIComponent(card.id)}" target="_blank" rel="noopener noreferrer" class="external-link-btn">Force of Windで画像を確認する</a></div>
		</section>
	`;
}

function makeCardHtml(cardsWithSameId, url, cards, keywords, cardHrefByName, cardReferenceMap, latestCardMap, cardByUid, raceMap, navigation) {
	const primaryCard = cardsWithSameId[0];
	const title = `${primaryCard.enName} (${primaryCard.jpName}) | Force of Will カード検索`;
	const description = makeDescription(primaryCard);
	const cardJsonLd = {
		'@context': 'https://schema.org',
		'@graph': cardsWithSameId.map((card) => ({
			'@type': 'VideoGameItem',
			name: card.enName,
			alternateName: card.jpName,
			description: makeDescription(card),
			url,
			identifier: card.id,
			category: asText(card.types),
			game: { '@type': 'VideoGame', name: 'Force of Will' }
		}))
	};
	const jsonLd = JSON.stringify(cardJsonLd).replace(/</g, '\\u003c');
	const details = cardsWithSameId.map((card) => makeCardDetailHtml(card, cards, keywords, cardHrefByName, cardReferenceMap, latestCardMap, cardByUid, raceMap)).join('');
	const previousLink = navigation.previousId
		? `<a class="modal-nav-btn" href="${escapeHtml(makeCardHref({ id: navigation.previousId }))}" style="text-decoration: none;">← ${escapeHtml(navigation.previousId)}</a>`
		: '<button class="modal-nav-btn" disabled>← </button>';
	const nextLink = navigation.nextId
		? `<a class="modal-nav-btn" href="${escapeHtml(makeCardHref({ id: navigation.nextId }))}" style="text-decoration: none;">${escapeHtml(navigation.nextId)} →</a>`
		: '<button class="modal-nav-btn" disabled>次のカード →</button>';
	const navigationHtml = navigation.total > 1 ? `<div class="modal-nav-container">
		<div class="modal-nav-bar">
			${previousLink}
			<span class="modal-nav-counter">${navigation.index + 1} / ${navigation.total}</span>
			${nextLink}
		</div>
	</div>` : '';

	return `<!doctype html>
<html lang="ja">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${escapeHtml(title)}</title>
	<meta name="description" content="${escapeHtml(description)}">
	<link rel="canonical" href="${escapeHtml(url)}">
	<meta property="og:type" content="article">
	<meta property="og:title" content="${escapeHtml(title)}">
	<meta property="og:description" content="${escapeHtml(description)}">
	<meta property="og:url" content="${escapeHtml(url)}">
	<meta property="og:site_name" content="Force of Will カード検索">
	<meta name="twitter:card" content="summary">
	<meta name="twitter:title" content="${escapeHtml(title)}">
	<meta name="twitter:description" content="${escapeHtml(description)}">
	<link rel="stylesheet" href="../style.css">
	<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
	<header class="site-header">
		<div class="header-inner">
			<h1 class="header-title"><a href="../" style="color: inherit; text-decoration: none;">Force of Will カード検索</a></h1>
		</div>
	</header>
	<main class="modal-content" style="margin: 4vh auto; max-height: none;">
		${navigationHtml}
		${details}
		<p style="text-align: center;"><a href="../">Force of Will カード検索へ戻る</a></p>
	</main>
	<div id="keyword-tooltip-popup" role="tooltip"></div>
	<script>
		const tooltip = document.getElementById('keyword-tooltip-popup');
		let activeTooltipTarget;
		function showTooltip(target) {
			if (!target?.dataset.tooltip) return;
			activeTooltipTarget = target;
			tooltip.textContent = target.dataset.tooltip;
			tooltip.classList.add('is-visible');
			const rect = target.getBoundingClientRect();
			const left = Math.max(12, Math.min(rect.left, window.innerWidth - tooltip.offsetWidth - 12));
			const top = rect.bottom + tooltip.offsetHeight + 12 <= window.innerHeight ? rect.bottom + 6 : Math.max(12, rect.top - tooltip.offsetHeight - 6);
			tooltip.style.left = left + 'px';
			tooltip.style.top = top + 'px';
		}
		function hideTooltip(target) {
			if (target && target !== activeTooltipTarget) return;
			tooltip.classList.remove('is-visible');
			activeTooltipTarget = null;
		}
		document.querySelectorAll('.keyword-tooltip').forEach((target) => {
			target.addEventListener('mouseenter', () => showTooltip(target));
			target.addEventListener('mouseleave', () => hideTooltip(target));
			target.addEventListener('focus', () => showTooltip(target));
			target.addEventListener('blur', () => hideTooltip(target));
			target.addEventListener('click', () => activeTooltipTarget === target ? hideTooltip(target) : showTooltip(target));
		});
		document.addEventListener('click', (event) => {
			if (!event.target.closest('.keyword-tooltip')) hideTooltip();
		});
	</script>
</body>
</html>
`;
}

async function build() {
	const cardData = JSON.parse(await fs.readFile(CARD_DATA_PATH, 'utf8'));
	const masterData = JSON.parse(await fs.readFile(MASTER_DATA_PATH, 'utf8'));
	if (!Array.isArray(cardData.cards)) {
		throw new TypeError('data/cards.json に cards 配列がありません。');
	}
	const cardHrefByName = makeCardHrefMap(cardData.cards, cardData.latestCardMap);
	const keywords = masterData.keywords || [];
	const raceMap = masterData.raceMap || {};
	const cardReferenceMap = cardData.cardReferenceMap || {};
	const latestCardMap = cardData.latestCardMap || {};
	const cardByUid = new Map(cardData.cards.map((card) => [card.uid, card]));

	await fs.mkdir(CARD_OUTPUT_DIR, { recursive: true });
	const sitemapEntries = [];
	let generatedCount = 0;

	const cardsById = new Map();
	for (const card of cardData.cards) {
		if (!card.id || card.enName === 'カード名（英語）') continue;
		if (!cardsById.has(card.id)) cardsById.set(card.id, []);
		cardsById.get(card.id).push(card);
	}
	const orderedCardIds = [...new Set(cardData.cards
		.filter((card) => card.id && card.enName !== 'カード名（英語）')
		.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))
		.map((card) => card.id))];
	const cardIndexById = new Map(orderedCardIds.map((cardId, index) => [cardId, index]));

	for (const [cardId, groupedCards] of cardsById) {
		groupedCards.sort((a, b) => String(a.uid).localeCompare(String(b.uid), 'ja', { numeric: true }));
		const index = cardIndexById.get(cardId);
		const navigation = {
			previousId: orderedCardIds[index - 1],
			nextId: orderedCardIds[index + 1],
			index,
			total: orderedCardIds.length
		};
		for (let faceIndex = 0; faceIndex < groupedCards.length; faceIndex++) {
			const filename = `${cardId}${faceIndex === 0 ? '' : `_${faceIndex + 1}`}.html`;
			const url = `${SITE_ORIGIN}/card/${encodeURIComponent(filename)}`;
			const orderedFaces = [groupedCards[faceIndex], ...groupedCards.filter((_, index) => index !== faceIndex)];
			await fs.writeFile(path.join(CARD_OUTPUT_DIR, filename), makeCardHtml(orderedFaces, url, cardData.cards, keywords, cardHrefByName, cardReferenceMap, latestCardMap, cardByUid, raceMap, navigation), 'utf8');
			sitemapEntries.push(`  <url><loc>${escapeHtml(url)}</loc></url>`);
			generatedCount += 1;
		}
	}

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.join('\n')}
</urlset>
`;
	await fs.writeFile(path.join(ROOT_DIR, 'sitemap.xml'), sitemap, 'utf8');
	console.log(`${generatedCount}件のカードHTMLとsitemap.xmlを生成しました。`);
}

build().catch((error) => {
	console.error('SSGの生成に失敗しました:', error);
	process.exitCode = 1;
});
