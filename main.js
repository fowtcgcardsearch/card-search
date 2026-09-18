/**　詳細検索_初期値の設定（検索項目が増えた場合はここをメンテ） */
const INITIAL_FORM_VALUES = {
  'det-text-input': '',
  'chk-name': true,
  'chk-text': true,
  'chk-no': false,
  'chk-flavor': false,
  'chk-light': false,
  'chk-fire': false,
  'chk-water': false,
  'chk-wind': false,
  'chk-darkness': false,
  'chk-void': false,
  'color-single': false,
  'color-multi': false,
  'chara-moon': false,
  'chara-time': false,
  'chara-void': false,
  'chara-x': false,
  'chk-paradox': false,
  'det-search-mode': 'fuzzy',
  'det-attri-mode': 'any',
  'det-cost-op': 'eq',
  'det-divinity-op': 'eq',
  'det-atk-op': 'eq',
  'det-def-op': 'eq',
  'det-total-cost': '',
  'det-divinity': '',
  'det-atk': '',
  'det-def': ''
};

let allCards = [];               // カード全量
let latestCardMap = {};          // 最新のカードとカードNoのマップ
let cardReferenceMap = {};       // 逆引き参照マップ
let filteredCards = [];          // 各検索条件によりフィルターされたカード
let currentPage = 1;             // 現在のページ数
let raceMapping = {};            // 種族を英語名と日本語名でマッピングするための補助変数
let keywords = {};               // キーワード能力を管理しツールチップを作成するための補助変数
let expansionRelations = {};     // 収録弾の紐づけリスト
let currentCardsETag = null;     // 現在読み込んでいるJSONの識別子を保持する変数
let currentVersionKey = null;    // 現在読み込んでいるJSONの更新履歴を保持する変数
let activeKeywordTooltip = null; // 表示中のキーワードツールチップを保持する変数
let keywordTooltipTimer = null;  // キーワードにマウスオーバーした時間を計測する変数

// ------------------------------------------------------------------------------------------------------------------
// 初期表示用関数
// ------------------------------------------------------------------------------------------------------------------

/**
 * 画面の初期化処理
 */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById("loading-overlay").style.display = "flex";
  
  // スクロールするたびに位置を記憶（負荷軽減のためrequestAnimationFrame等の利用も可）
  window.addEventListener('scroll', () => {
    // モーダル表示中（bodyがfixedのとき）は保存しない
    if (document.body.style.position !== 'fixed') {
      sessionStorage.setItem('scrollY', window.scrollY || document.documentElement.scrollTop);
    }
  });

  // JSONファイルからプルダウンとカードデータを作成
  loadInitialData();
  // 他に既存の初期化処理（最初のデータ読み込みなど）があればここに並べて記述してください
  const detailModal = document.getElementById("detail-modal");
  if (detailModal) {
    detailModal.addEventListener("click", function(event) {
      // モーダルの背景そのものをクリックした場合だけ閉じる
      if (event.target === detailModal) {
        closeModal();
      }
    });
  }
  const modalContent = document.querySelector(".modal-content");
  if (modalContent) {
    modalContent.addEventListener("scroll", function() {
      hideKeywordTooltip();
    }, { passive: true });

    let touchStartX = 0;
    let touchStartY = 0;
    let lastTapTime = 0;

    // タッチ開始時の座標を取得
    modalContent.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    modalContent.addEventListener("touchend", (e) => {
      // ボタンやリンク、テキストのタップ時は動作させない
      if (e.target.closest("button, a, input, select, .keyword-tooltip, .reprint-item")) {
        return;
      }

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;

      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;

      // --- スワイプ判定 (横移動が50px以上かつ、縦移動より横移動が大きい場合) ---
      if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
        const btns = document.querySelectorAll('.modal-nav-btn');
        if (diffX > 0) {
          // 右スワイプ → 前のカードへ
          if (btns[0] && !btns[0].disabled) btns[0].click();
        } else {
          // 左スワイプ → 次のカードへ
          if (btns[1] && !btns[1].disabled) btns[1].click();
        }
        return;
      }

      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTapTime;

      // 300ms以内の連続タップをダブルタップと判定
      if (tapLength < 300 && tapLength > 0) {
        closeModal();
        e.preventDefault();
      }
      lastTapTime = currentTime;
    });
  }
  initAutoUpdateCheck();
});

/**
* 初期処理にてjsonファイルを読み込む
*/
function loadInitialData() {
  // 自ドメイン（GitHub Pages）内の JSON ファイルを相対パスで取得
  Promise.all([
    fetch('./data/cards.json').then(res => res.json()),
    fetch('./data/master.json').then(res => res.json())
  ])
  .then(([cardData, options]) => {
    console.log("GitHubからのデータ取得成功");
    if (options) {
      raceMapping = options.raceMap; // ここで保存
      keywords = options.keywords
      setupSearchDropdowns(options);
      expansionRelations = options.expRelations || {};
  
      // 色構成チェックの排他制御
      const singleChk = document.getElementById('color-single');
      const multiChk = document.getElementById('color-multi');
  
      // 単色のみがチェックされたら、多色のみを外す
      singleChk.addEventListener('change', () => {
        if (singleChk.checked) {
          multiChk.checked = false;
        }
      });
      // 多色のみがチェックされたら、単色のみを外す
      multiChk.addEventListener('change', () => {
        if (multiChk.checked) {
          singleChk.checked = false;
        }
      });
      restoreSearchConditionsFromCache();
    }
    if (cardData) loadCardData(cardData);
  })
  .catch(err => {
    console.error("データ読み込みエラー:", err);
    alert("データの読み込みに失敗しました。");
  });
}

/**
 * データベースからカードデータを取得する処理
 */
function loadCardData(data) {
  allCards = data.cards.filter(card => card.enName !== "カード名（英語）" && card.jpName !== "カード名（日本語）")
                  .map(card => ({
                    ...card,
                    // 文字列として "-" または 空文字の場合のみ "-" にし、数値の 0 はそのまま残す
                    totalCost: (card.totalCost === "-" || card.totalCost === "") ? "-" : parseInt(card.totalCost),
                    // divinity は文字列（"∞" など）も入るため parseInt を外してトリムのみ行う
                    divinity: (card.divinity === "-" || card.divinity === null || card.divinity === undefined) ? "-" : String(card.divinity).trim(),
                    atk: (card.atk === "-" || card.atk === "") ? "-" : parseInt(card.atk),
                    def: (card.def === "-" || card.def === "") ? "-" : parseInt(card.def)
                  }));
  allCards.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
  filteredCards = [...allCards];
  latestCardMap = data.latestCardMap;
  cardReferenceMap = data.cardReferenceMap;
  document.getElementById("loading-overlay").style.display = "none";

  // データ準備完了後、保存されたセッション状態を復元して検索を実行
  restoreSearchSession();
}

/**
 * GASから取得したデータに基づいて検索コンテナに選択肢をセットする関数
 */
function setupSearchDropdowns(options) {
  createCheckboxes("filter-container-cardtype", options.cardTypes, "chk-type");
  createCheckboxesWithObj("filter-container-race", options.races, "chk-race");
  createCheckboxesWithGroup("filter-container-expansion", options.expansions, "chk-exp");
  createCheckboxes("filter-container-rarity", options.rarities, "chk-rarity");
  createCheckboxes("filter-container-illustrator", options.illustrators, "chk-illustrator");
  ['chk-type', 'chk-race', 'chk-exp', 'chk-rarity', 'chk-illustrator'].forEach(prefix => {
    attachCheckboxListeners(prefix);
  });
}

/**
 * 検索コンテナ作成
 */
function createCheckboxes(containerId, list, prefix) {
  const container = document.getElementById(containerId);
  list.forEach(val => {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" class="${prefix}" value="${escapeHtml(val)}"> ${val}`;
    container.appendChild(label);
  });
}

/**
 * 検索コンテナ作成(オブジェクト形式)
 */
function createCheckboxesWithObj(containerId, list, prefix) {
  const container = document.getElementById(containerId);
  list.forEach(item => {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" class="${prefix}" value="${escapeHtml(item.value)}" data-text="${escapeHtml(item.text)}"> ${item.text}`;
    container.appendChild(label);
  });
}

/**
 * 検索コンテナ作成(グループ)
 */
function createCheckboxesWithGroup(containerId, groupedList, prefix) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = ""; // 初期化

  groupedList.forEach((group, index) => {
    const clusterId = `chk-cluster-${prefix}-${index}`;

    // 1. クラスタの見出し（全選択用チェックボックス付きの単一 label）
    const headerLabel = document.createElement("label");
    headerLabel.className = "cluster-group-header";
    headerLabel.style.display = "flex";
    headerLabel.style.alignItems = "center";
    headerLabel.style.gap = "6px";
    headerLabel.style.fontWeight = "bold";
    //headerLabel.style.color = "#475569";
    headerLabel.style.padding = "8px 4px 4px 4px";
    headerLabel.style.fontSize = "0.9em";
    headerLabel.style.borderBottom = "1px solid #cbd5e1";
    headerLabel.style.marginTop = "8px";
    headerLabel.style.cursor = "pointer";

    headerLabel.innerHTML = `
      <input type="checkbox" id="${clusterId}" class="chk-cluster-header ${prefix}-header" style="margin: 0;">
      <span>${escapeHtml(group.cluster)}</span>
    `;

    container.appendChild(headerLabel);

    const headerCheckbox = headerLabel.querySelector('input[type="checkbox"]');

    // 2. そのクラスタに属するアイテム群
    const itemContainer = document.createElement("div");
    itemContainer.className = "cluster-item-group";

    group.items.forEach(item => {
      const label = document.createElement("label");
      label.style.display = "block";
      label.style.padding = "4px 8px";
      
      label.innerHTML = `
        <input type="checkbox" class="${prefix}" value="${escapeHtml(item.value)}" data-text="${escapeHtml(item.text)}">
        ${escapeHtml(item.text)}
      `;
      itemContainer.appendChild(label);
    });

    container.appendChild(itemContainer);

    // 3. 見出しチェックボックス変更時の連動処理
    headerCheckbox.addEventListener('change', (e) => {
      const childCheckboxes = itemContainer.querySelectorAll(`.${prefix}`);
      childCheckboxes.forEach(cb => {
        cb.checked = e.target.checked;
      });
      // タグ表示・選択スタイルの更新
      updateSelectedTags(prefix);
    });
  });
}

/**
 * 初期読み込み時にETagを保存し、定期チェックを開始する
 */
function initAutoUpdateCheck() {
  // 初回データ取得時に ETag も一緒に記録しておく
  fetch('./data/cards.json', { method: 'HEAD' })
    .then(res => {
      currentCardsETag = res.headers.get('ETag');
      
      // 60秒（1分）ごとに更新がないかチェックを開始
      setInterval(checkForUpdates, 60000);
    });

    // スマホでアプリ画面に戻ってきた（復帰した）瞬間を検知して即座にチェック
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log("アプリに復帰しました。更新をチェックします。");
        checkForUpdates();
      }
    });
}

/**
 * JSONの更新をチェックする関数（超軽量）
 */
function checkForUpdates() {
  // HEADリクエストでヘッダー情報（ETag）だけを取得（JSON本体はダウンロードしない）
  fetch('./data/cards.json', { method: 'HEAD', cache: 'no-cache' })
    .then(res => {
      const newETag = res.headers.get('ETag');
      
      // 初回とETagが変わっている ＝ GitHub上でJSONが更新された！
      if (currentCardsETag && newETag && currentCardsETag !== newETag) {
        console.log("新しいカードデータが検知されました。データを再読み込みします。");
        currentCardsETag = newETag;
        
        // データを再取得して画面を再描画する関数を呼ぶ
        reloadAllData();
      }
    })
    .catch(err => console.warn("更新チェック失敗:", err));
}

/**
 * データを再取得して画面を更新する処理
 */
function reloadAllData() {
  Promise.all([
    fetch('./data/cards.json?t=' + Date.now()).then(res => res.json()),
    fetch('./data/master.json?t=' + Date.now()).then(res => res.json())
  ])
  .then(([cardData, masterData]) => {
    // 既存のグローバル変数を上書き
    window.cardData = cardData;
    window.masterData = masterData;
    
    // 画面のカード一覧やプルダウンを再描画（既存の描画関数を実行）
    loadCardData(cardData); 
    
    // ユーザーへトースト通知
    showToast("最新のカードデータに更新されました");
  });
}

/**
 * 画面の右下に自動で消える通知（トースト）を表示する関数
 */
function showToast(message) {
  // すでに古いトーストが残っている場合は先に削除
  const oldToast = document.getElementById("custom-toast");
  if (oldToast) oldToast.remove();

  // 1. トーストの親コンテナを作成
  const toast = document.createElement("div");
  toast.id = "custom-toast";
  
  // スタイルをJavaScriptで直接指定（右下に配置、背景緑、白文字、フワッと浮き出る影）
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    backgroundColor: "#2e7d32", // 安心感のあるグリーン
    color: "#ffffff",
    padding: "12px 20px",
    borderRadius: "4px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    fontSize: "14px",
    fontWeight: "bold",
    zIndex: "10000", // オーバーレイよりも手前に表示
    display: "flex",
    alignItems: "center",
    gap: "15px",
    fontFamily: "sans-serif",
    opacity: "0",
    transition: "opacity 0.3s ease, transform 0.3s ease",
    transform: "translateY(20px)"
  });

  // 2. メッセージテキスト部分
  const textNode = document.createElement("span");
  textNode.innerText = message;
  toast.appendChild(textNode);

  // 3. ×ボタン（閉じるボタン）
  const closeBtn = document.createElement("span");
  closeBtn.innerHTML = "&times;"; // HTMLの×記号
  Object.assign(closeBtn.style, {
    cursor: "pointer",
    fontSize: "18px",
    lineHeight: "1",
    opacity: "0.7",
    padding: "0 2px"
  });
  // マウスを乗せたときに少し明るくする
  closeBtn.onmouseover = () => closeBtn.style.opacity = "1";
  closeBtn.onmouseout = () => closeBtn.style.opacity = "0.7";
  
  // ×ボタンを押した時の消去処理
  closeBtn.onclick = () => {
    fadeAndRemove(toast);
  };
  toast.appendChild(closeBtn);

  // 4. 画面（body）に追加
  document.body.appendChild(toast);

  // 5. アニメーション（ちょっと時間を置いてからフワッと表示）
  setTimeout(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  }, 50);

  // 6. 3秒後に自動的に消去するタイマーを設定
  setTimeout(() => {
    if (document.getElementById("custom-toast")) {
      fadeAndRemove(toast);
    }
  }, 3000); // 3000ミリ秒 = 3秒
}

/**
 * トーストをフワッと消してから要素を削除するヘルパー関数
 */
function fadeAndRemove(element) {
  element.style.opacity = "0";
  element.style.transform = "translateY(20px)";
  // アニメーション（0.3s）が終わった後に要素を完全に消す
  setTimeout(() => {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }, 300);
}

// ------------------------------------------------------------------------------------------------------------------
// 検索フォーム操作用関数
// ------------------------------------------------------------------------------------------------------------------

/**
 * 検索タブの切り替え
 */
function switchTab(mode) {
  document.getElementById('tab-basic').className = mode === 'basic' ? 'tab active' : 'tab';
  document.getElementById('tab-detailed').className = mode === 'detailed' ? 'tab active' : 'tab';
  document.getElementById('tab-import').className = mode === 'import' ? 'tab active' : 'tab';
  document.getElementById('basic-search-form').style.display = mode === 'basic' ? 'flex' : 'none';
  document.getElementById('detailed-search-form').style.display = mode === 'detailed' ? 'flex' : 'none';
  document.getElementById('import-search-form').style.display = mode === 'import' ? 'flex' : 'none';
}

/**
 * 詳細検索フォームを折りたたみ/展開する関数
 */
function toggleDetailedForm() {
  const form = document.getElementById('detailed-inputs');
  form.style.display = (form.style.display === 'none') ? 'flex' : 'none';
}

/**
 * インポート検索フォームを折りたたみ/展開する関数
 */
function toggleImportForm() {
  const form = document.getElementById('import-inputs');
  form.style.display = (form.style.display === 'none') ? 'flex' : 'none';
}

/**
 * 検索コンテナの開閉関数
 */
function toggleAccordion(btn) {
  const content = btn.parentElement.querySelector('.accordion-content');
  const isHidden = content.style.display === 'none';
  content.style.display = isHidden ? 'grid' : 'none';
  // ボタンの矢印方向を変えたい場合はここに処理を追加
  btn.innerText = isHidden ? btn.innerText.replace('▼', '▲') : btn.innerText.replace('▲', '▼');
}

/**
 * 選択状態を表示するエリアを更新する関数
 */
function updateSelectedTags(prefix) {
  const container = document.getElementById(`selected-tags-${prefix}`);
  if (!container) return;

  container.innerHTML = ""; // クリア
  
  // チェックされている要素を取得
  const checkedBoxes = document.querySelectorAll(`.${prefix}:checked`);
  
  checkedBoxes.forEach(cb => {
    const tag = document.createElement("span");
    tag.className = "selected-tag";

    // 表示名
    const displayText = cb.getAttribute('data-text') || cb.value;

    tag.innerHTML = `${displayText} <span class="remove-tag">×</span>`;
    
    // バッジをクリックで解除
    tag.onclick = () => {
      cb.checked = false;
      updateSelectedTags(prefix); // 再描画
    };
    container.appendChild(tag);
  });
}

/**
 * チェックボックス変更時に自動でバッジを更新するリスナーを設定
 */
function attachCheckboxListeners(prefix) {
  const checkboxes = document.querySelectorAll(`.${prefix}`);
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      // 個別選択時、親（見出し）の状態も連動させる処理
      const itemGroup = cb.closest('.cluster-item-group');
      if (itemGroup) {
        const headerContainer = itemGroup.previousElementSibling;
        if (headerContainer && headerContainer.classList.contains('cluster-group-header')) {
          const headerCheckbox = headerContainer.querySelector('.chk-cluster-header');
          if (headerCheckbox) {
            const siblings = Array.from(itemGroup.querySelectorAll(`.${prefix}`));
            const allChecked = siblings.every(sibling => sibling.checked);
            headerCheckbox.checked = allChecked;
          }
        }
      }

      updateSelectedTags(prefix);
    });
  });
}

/**
 * 特定のコンテナ内のチェックボックスをキーワードで絞り込む関数
 * @param {HTMLInputElement} input - 検索窓自身
 * @param {string} containerId - 絞り込む対象の親ID
 */
function filterCheckboxList(input, containerId) {
  const filter = input.value.toLowerCase();
  const container = document.getElementById(containerId);
  const labels = container.getElementsByTagName('label');

  for (let i = 0; i < labels.length; i++) {
    const text = labels[i].textContent.toLowerCase();
    // キーワードが含まれていれば表示、なければ非表示
    labels[i].style.display = text.includes(filter) ? "" : "none";
  }
}

/**
 * 詳細検索の値をすべて初期値に戻す関数
 */
function resetDetailedSearch() {
  // 1. 基本的な入力項目（テキスト、数値、セレクトボックス）のクリア
  Object.keys(INITIAL_FORM_VALUES).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    const val = INITIAL_FORM_VALUES[id];

    if (el.type === 'checkbox') {
      el.checked = val;
    } else if (el.tagName === 'SELECT') {
      // セレクトボックスの場合、valueを明示的にセット
      el.value = val;
      // もしvalueが反映されない場合はselectedIndexを0にするなどのフォールバック
      if (el.value !== val) el.selectedIndex = 0; 
    } else {
      // テキストや数値入力
      el.value = val;
    }
  });

  // 複数選択系（チェックボックスグループ）の全解除
  const checkboxClasses = ['.chk-type', '.chk-race', '.chk-exp', '.chk-rarity', '.chk-illustrator'];
  checkboxClasses.forEach(cls => {
    document.querySelectorAll(cls).forEach(el => el.checked = false);
  });

  // バッジ表示エリアのクリア
  const prefixes = ['chk-type', 'chk-race', 'chk-exp', 'chk-rarity', 'chk-illustrator'];
  prefixes.forEach(prefix => {
    const container = document.getElementById(`selected-tags-${prefix}`);
    if (container) {
      container.innerHTML = "";
    }
  });

  const filterInputs = [
    { inputId: 'filter-input-type', containerId: 'filter-container-cardtype' },
    { inputId: 'filter-input-race', containerId: 'filter-container-race' },
    { inputId: 'filter-input-exp', containerId: 'filter-container-expansion' },
    { inputId: 'filter-input-rarity', containerId: 'filter-container-rarity' },
    { inputId: 'filter-input-illustrator', containerId: 'filter-container-illustrator' }
  ];

  // 絞り込み検索用のテキストボックスと、非表示になった要素の復元
  filterInputs.forEach(item => {
    // 検索入力欄自体を空にする
    const inputEl = document.querySelector(`input[onkeyup*="${item.containerId}"]`);
    if (inputEl) inputEl.value = "";

    // 非表示になっていた label をすべて再表示する
    const container = document.getElementById(item.containerId);
    if (container) {
      const labels = container.getElementsByTagName('label');
      for (let label of labels) {
        label.style.display = ""; // 空文字でインラインスタイル（display:none）を解除
      }
    }
  });

  // クラスタヘッダの選択状態をすべて解除
  document.querySelectorAll('.chk-cluster-header').forEach(el => el.checked = false);
}

// ------------------------------------------------------------------------------------------------------------------
// 検索用関数
// ------------------------------------------------------------------------------------------------------------------

/**
 * 基本検索
 */
function searchCards(isRestoring = false) {
  // セッションに現在のタブ状態を保存
  sessionStorage.setItem('activeSearchTab', 'basic');
  initNavigation(isRestoring);

  const input = document.getElementById("search-input").value;
  if (!input.trim()) {
    filteredCards = [...allCards];
  } else {
    const keywords = input.trim().toLowerCase().split(/[\s ]+/);
    filteredCards = allCards.filter(card => {
      // 検索対象の文字列を結合（名前＋テキスト）
      // 必要であればここに card.enFlavor や card.jpFlavor を足すことも可能です
      const target = `
        ${card.jpName || ''} 
        ${card.enName || ''} 
        ${card.jpText || ''} 
        ${card.enText || ''} 
      `.toLowerCase();
      return keywords.every(kw => target.includes(kw));
    });
  }
  displayCards();
}

/**
 * 詳細検索
 */
function searchDetailedCards(isRestoring = false) {
  // セッションに現在のタブ状態を保存
  sessionStorage.setItem('activeSearchTab', 'detailed');
  initNavigation(isRestoring);

  // HTML要素が存在するかチェックし、無ければ空文字にする（エラー防止）
  const detTextInputEl = document.getElementById('det-text-input');
  const textInput = detTextInputEl ? detTextInputEl.value.toLowerCase().trim() : '';
  
  // 入力値をキーワード配列に分解
  const textKeywords = detTextInputEl ? detTextInputEl.value.toLowerCase().split(/[\s ]+/).filter(Boolean) : [];
  const hasTextSearch = textKeywords.length > 0 && textKeywords[0] !== "";
  const searchMode = document.getElementById('det-search-mode')?.value || 'fuzzy';

  // テキスト入力欄の検索対象チェックボックス
  const chkName = document.getElementById('chk-name')?.checked || false;
  const chkText = document.getElementById('chk-text')?.checked || false;
  const chkNo = document.getElementById('chk-no')?.checked || false;
  const chkFlavor = document.getElementById('chk-flavor')?.checked || false;

  // 属性
  const attris = Array.from(document.querySelectorAll('.chk-attri:checked')).map(el => el.value);
  const attriMode = document.getElementById('det-attri-mode')?.value || 'any';
  const isSingleOnly = document.getElementById('color-single').checked || false;
  const isMultiOnly = document.getElementById('color-multi').checked || false;
  const characteristics = Array.from(document.querySelectorAll('.chk-chara:checked')).map(el => el.value);
  const cost = document.getElementById('det-total-cost')?.value || '';
  const costOp = document.getElementById('det-cost-op')?.value || 'eq';
  let div = document.getElementById('det-divinity')?.value || '';
  div = div.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
  const divOp = document.getElementById('det-divinity-op')?.value || 'eq';
  const atk = document.getElementById('det-atk')?.value || '';
  const atkOp = document.getElementById('det-atk-op')?.value || 'eq';
  const def = document.getElementById('det-def')?.value || '';
  const defOp = document.getElementById('det-def-op')?.value || 'eq';
  const chkParadox = document.getElementById('chk-paradox')?.checked || false;

  // 複数選択された値を取得するヘルパー関数
  const getCheckedValues = (cls) => {
    return Array.from(document.querySelectorAll(`.${cls}:checked`)).map(el => el.value);
  };
  const types = getCheckedValues('chk-type');
  const races = getCheckedValues('chk-race');
  const exps = getCheckedValues('chk-exp');
  const rarities = getCheckedValues('chk-rarity');
  const illustrators = getCheckedValues('chk-illustrator');

  // 選択されたコードに紐づく「おまけパックのコード」も含めた検索用配列を作る
  let expandedExps = [];
  exps.forEach(code => {
    if (expansionRelations[code]) {
      // expansionRelations['MP03'] は ['MP03', 'MC10'] なので、両方追加される
      expandedExps = expandedExps.concat(expansionRelations[code]);
    } else {
      expandedExps.push(code);
    }
  });

  filteredCards = allCards.filter(card => {
    if (!card) return false;

    if (hasTextSearch) {
      // 指定された検索対象カテゴリ(名前, テキスト等)ごとに値を安全に取り出す
      const targets = [];
      if (chkName) {
        if (card.jpName) targets.push(card.jpName.toLowerCase());
        if (card.enName) targets.push(card.enName.toLowerCase());
      }
      if (chkText) {
        if (card.jpText) targets.push(card.jpText.toLowerCase());
        if (card.enText) targets.push(card.enText.toLowerCase());
      }
      if (chkNo && card.id) {
        targets.push(card.id.toLowerCase());
      }
      if (chkFlavor) {
        if (card.jpFlavor) targets.push(card.jpFlavor.toLowerCase());
        if (card.enFlavor) targets.push(card.enFlavor.toLowerCase());
      }

      // 対象項目のいずれかがキーワードマッチ条件を満たしているか検証
      if (searchMode === 'exact') {
        // 1. 入力した通りの文字列をそのまま含むか (完全/フレーズ一致)
        const isMatch = targets.some(target => target.includes(textInput));
        if (!isMatch) return false;
      } else if (searchMode === 'fuzzy') {
        // 2. 入力したすべての単語を、順不同で含むか (AND検索)
        const isMatch = textKeywords.every(kw => {
          return targets.some(target => target.includes(kw));
        });
        if (!isMatch) return false;
      } else if (searchMode === 'partial') {
        // 3. 入力した単語のうち、いずれか1つ以上を含むか (OR検索)
        const isMatch = textKeywords.some(kw => {
          return targets.some(target => target.includes(kw));
        });
        if (!isMatch) return false;
      }
    }

    if (attris.length > 0) {
      // card.attris が配列でない場合（空の場合）に備えて空配列をデフォルトにする
      const cardAttris = card.attris || [];
      if (!filterByAttributes(cardAttris, attris, attriMode)) return false;
    }
    // 単色のみチェック時：属性が1つではないカードを除外
    if (isSingleOnly) {
      if (!card.attris || card.attris.length !== 1) {
        return false; // または continue; (既存のループ形式に合わせてください)
      }
    }
    // 多色のみチェック時：属性が2つ未満のカードを除外
    if (isMultiOnly) {
      if (!card.attris || card.attris.length < 2) {
        return false; // または continue;
      }
    }

    if (characteristics.length > 0 && !characteristics.some(chara => card.cost.includes(chara))) return false;
    if (cost !== "" && !checkStatus(card.totalCost, costOp, cost)) return false;
    if (div !== "" && !checkStatus(card.divinity, divOp, div)) return false;
    if (atk !== "" && !checkStatus(card.atk, atkOp, atk)) return false;
    if (def !== "" && !checkStatus(card.def, defOp, def)) return false;

    // パラドックスカードのみ表示にチェックが入っていて、かつ値が空なら弾く
    if (chkParadox && (!card.paradox || card.paradox.trim() === "")) return false;

    // OR検索ロジック（配列に値がある場合、いずれか一つでも含まれていればOK）
    if (types.length > 0 && (!card.types || !card.types.some(t => types.includes(t)))) return false;
    if (races.length > 0 && (!card.races || !card.races.some(r => races.some(fr => r.toLowerCase() === fr.toLowerCase())))) return false;
    if (expandedExps.length > 0 && (!card.expansionCode || !expandedExps.includes(card.expansionCode))) return false;
    if (rarities.length > 0 && (!card.rarity || !rarities.includes(card.rarity))) return false;
    if (illustrators.length > 0 && (!card.illustrators || !card.illustrators.some(r => illustrators.some(fr => r.toLowerCase() === fr.toLowerCase())))) return false;
    
    return true;
  });
  
  // 最後に検索フォームを閉じる
  document.getElementById('detailed-inputs').style.display = 'none';
  displayCards();
}

/**
 * リストからインポートして検索
 */
function searchImportedCards(isRestoring = false) {
  // セッションに現在のタブ状態を保存
  sessionStorage.setItem('activeSearchTab', 'import');
  initNavigation(isRestoring);

  const rawText = document.getElementById('import-text-input').value;
  const lines = rawText.split('\n');
  const targetNames = [];
  lines.forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine === "" || trimmedLine.startsWith('//')) return;
    const match = trimmedLine.match(/^(\d+)\s+(.+)/);
    if (match && match[2]) targetNames.push(match[2].trim());
  });

  const warningArea = document.getElementById('import-warning-area');
  warningArea.innerText = "";

  if (targetNames.length === 0) return;

  // 各名前を小文字化して保持（判定用）
  const targetNamesLower = targetNames.map(n => n.toLowerCase());
  const foundNames = new Set();
  
  // ヒット判定を大文字小文字無視で行う
  const allMatches = allCards.filter(card => {
    const enNameLower = (card.enName || "").toLowerCase();
    const jpNameLower = (card.jpName || "").toLowerCase();
    
    // リスト内のいずれかと小文字で一致するか
    const isMatch = targetNamesLower.includes(enNameLower) || targetNamesLower.includes(jpNameLower);
    
    if (isMatch) {
      // ヒットした名前（入力リスト側の表記）を記録用に変換（どれにヒットしたか判別）
      const foundEntry = targetNames.find(n => n.toLowerCase() === enNameLower || n.toLowerCase() === jpNameLower);
      if (foundEntry) foundNames.add(foundEntry);
    }
    return isMatch;
  });

  // 未ヒットのカード名を特定
  const notFoundNames = targetNames.filter(name => !foundNames.has(name));
  if (notFoundNames.length > 0) {
    warningArea.innerText = "以下のカードは見つかりませんでした: " + notFoundNames.join(", ");
  }

  // 重複制御ロジック
  const primaryCards = [];
  const extraCards = [];

  targetNames.forEach(name => {
    const nameLower = name.toLowerCase();
    const matches = allMatches.filter(c => 
      (c.enName && c.enName.toLowerCase() === nameLower) || 
      (c.jpName && c.jpName.toLowerCase() === nameLower)
    );
    
    if (matches.length === 0) return;

    matches.sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate));
    
    primaryCards.push(matches.pop());
    extraCards.push(...matches);
  });

  filteredCards = [...primaryCards, ...extraCards];
  displayCards();
}

/**
 * 手動検索時に表示件数とソートをリセットする関数
 */
function initNavigation(isRestoring){
  if(!isRestoring){
    // 表示件数とソートをリセット
    const sizeSelect = document.getElementById("page-size-select");
    if (sizeSelect) sizeSelect.value = "30";
    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) sortSelect.value = "date-desc";
    // const enCardText = document.getElementById("toggle-card-en-text");
    // if (enCardText) enCardText.checked = false;
    // const jpCardText = document.getElementById("toggle-card-jp-text");
    // if (jpCardText) jpCardText.checked = false;
    currentPage = 1;
  }
}

/**
 * 属性検索のフィルター条件
 */
function filterByAttributes(cardAttributes, checkedAttris, mode) {
  if (checkedAttris.length === 0) return true; // 未選択なら全対象

  switch (mode) {
    case 'any':
      // どれか一つでも含まれているか
      return checkedAttris.some(attr => cardAttributes.includes(attr));

    case 'all':
      // 選択したすべてが含まれているか（余分な属性があってもOK）
      return checkedAttris.every(attr => cardAttributes.includes(attr));

    case 'only':
      // カードの全属性が、選択した属性の範囲内に収まっているか
      return cardAttributes.length > 0 && 
             cardAttributes.every(attr => checkedAttris.includes(attr));      
    case 'strict':
      // 属性の数が一致し、かつすべて含まれているか
      return cardAttributes.length === checkedAttris.length && 
             checkedAttris.every(attr => cardAttributes.includes(attr));

    default:
      return true;
  }
}

/**
 * 数値検索の比較演算子判定
 */
function checkStatus(val, op, target) {
  // 1. 検索対象の値が空なら無視
  if (target === "") return true;

  // 2. ステータスを正規化して判定（「-」や空文字、nullを完全に弾く）
  const cleanVal = String(val).trim();
  if (cleanVal === "" || cleanVal === "-" || cleanVal === "null" || cleanVal === "undefined") {
    return false;
  }
  

  // 3. 数値に変換（"∞" や "Infinity" は JavaScript の Infinity に変換）
  let v;
  if (cleanVal === "∞" || cleanVal.toLowerCase() === "infinity") {
    v = Infinity;
  } else {
    v = Number(cleanVal);
  }
  const t = Number(target);

  // 4. 数字として無効な場合も弾く
  if (isNaN(v) || isNaN(t)) return false;

  // 5. 比較
  switch (op) {
    case 'eq': return v === t;
    case 'gt': return v > t;
    case 'lt': return v < t;
    case 'ge': return v >= t; // 以上
    case 'le': return v <= t; // 以下
    default: return true;
  }
}

// ------------------------------------------------------------------------------------------------------------------
// 検索結果表示用関数
// ------------------------------------------------------------------------------------------------------------------

/** 
 * カード一覧表示
 */
function displayCards() {
  try {
    const container = document.getElementById("card-list");
    container.innerHTML = "";

    const sizeSelect = document.getElementById("page-size-select");
    const sizeSelectorWrapper = document.getElementById("page-size-select-wrapper"); // プルダウンの親

    // 検索結果数に基づいたプルダウンの表示制御
    if (sizeSelectorWrapper) {
      sizeSelectorWrapper.style.display = (filteredCards.length < 30) ? "none" : "";
    }

    const sizeValue = sizeSelect ? sizeSelect.value : "30";
    const limit = (sizeValue === 'all') ? filteredCards.length : parseInt(sizeValue, 10);

    if (filteredCards.length === 0) {
      container.innerHTML = "<p class='info-msg'>該当するカードが見つかりません。</p>";
      document.getElementById("controls-bar").style.display = "none";
      document.getElementById("footer-controls-bar").style.display = "none";
      return;
    }
    document.getElementById("controls-bar").style.display = "flex";
    document.getElementById("footer-controls-bar").style.display = "flex";

    // 現在の検索ヒット件数を画面に反映
    document.getElementById("search-count").innerText = `検索結果: ${filteredCards.length}件`;

    const start = (currentPage - 1) * limit;
    const pagedCards = filteredCards.slice(start, start + limit);

    pagedCards.forEach(card => {
      // タイプと種族の結合表示ロジック
      const typesHtml = card.types && card.types.length ? card.types.join("・") : "";
      const racesHtml = card.races && card.races.length ? card.races.map(race => {
        const enName = race.trim();
        const jpName = raceMapping[enName];
        return jpName ? `${enName}(${jpName})` : enName;
      }).join("・") : "";
      // 表示用HTMLを生成
      let typeAndRaceHtml = "";
      if (typesHtml && racesHtml) {
        typeAndRaceHtml = `<strong>${typesHtml}</strong> - ${racesHtml}`;
      } else {
        typeAndRaceHtml = typesHtml ? `<strong>${typesHtml}</strong>` : (racesHtml || "-");
      }

      const cardEl = document.createElement("div");
      cardEl.className = "card-item";

      // 神力の表示（神力がない場合は非表示）
      const divinityHtml = (card.divinity !== "-" && card.divinity !== "") ? `
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 2px;">神力: ${card.divinity}</div>
      ` : "";

      // ウィルパワーの表示（神力がない場合は非表示）
      const willpowerHtml = (card.willpower !== "-" && card.willpower !== "") ? `
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 2px;">ウィルパワー: ${card.willpower}</div>
      ` : "";

      // ATK/DEFの表示ロジック
      const statusHtml = (card.atk !== "-" || card.def !== "-") ? `
        <div style="font-weight: bold; font-size: 15px; margin-bottom: 4px;">
          ${card.atk !== "-" ? `${card.atk}` : ""}
          ${(card.atk !== "-" && card.def !== "-") ? " / " : ""}
          ${card.def !== "-" ? `${card.def}` : ""}
        </div>
      ` : "";

      // イラストレーターの表示（値がある場合のみ）
      const illusHtml = (card.illustrators && card.illustrators !== "-") ? `
        <div style="font-size: 13px; margin-top: 4px;"><strong>イラストレーター:</strong> ${card.illustrators}</div>
      ` : "";

      cardEl.innerHTML = `
        <div class="card-header">
          <h3>${card.enName || 'No Name'}<br><small>${card.jpName || ''}</small></h3>
          <div class="header-attris">${getAttriBadgeHtml(card.attris)}</div>
        </div>
        
        <div class="card-body">
          <div style="font-weight: bold; margin-bottom: 6px;">
            コスト: ${getCostBadgeHtml(card.cost)}
          </div>
          <div style="font-size: 13px; margin-bottom: 8px; color: #475569;">${typeAndRaceHtml}</div>
          <div class="card-text-en-content" style="margin-bottom: 8px; color: #475569; display: none">${renderKeywordTooltips(escapeHtml(card.enText))}</div>
          <div class="card-text-jp-content" style="margin-bottom: 8px; color: #475569; display: none">${renderKeywordTooltips(escapeHtml(card.jpText))}</div>
          ${divinityHtml}
          ${willpowerHtml}
          ${statusHtml}
        </div>

        <div class="card-footer-info">
          <div style="font-size: 13px;">
            <strong>No:</strong> ${card.id || '-'} ${card.rarity || '-'}
            ${illusHtml}
          </div>
        </div>
        
        <button onclick="openDetail('${card.uid}')" class="detail-btn">詳細を見る</button>
      `;

      container.appendChild(cardEl);
    });
    
    setupPagination(limit);
    toggleTextVisibility();
  } finally {
    saveSearchConditionsToCache();
  }
}

/**
 * ページ数切り替え用のナビゲーションバー表示関数
 */
function setupPagination(limit) {
  const containers = [document.getElementById("pagination"), document.getElementById("footer-pagination")];
  const totalPages = Math.ceil(filteredCards.length / limit);
  
  if (totalPages <= 1) {
    containers.forEach(c => c.innerHTML = "");
    document.getElementById("footer-controls-bar").style.display = "none";
    return;
  }

  // ページボタン生成用のヘルパー（変更なし）
  const createBtn = (text, page, isActive = false, isDisabled = false) => {
    const btn = document.createElement("button");
    btn.className = "page-btn" + (isActive ? " active" : "");
    if (isDisabled) btn.disabled = true;
    btn.innerText = text;
    btn.onclick = () => {
      currentPage = page;
      displayCards();
      window.scrollTo(0, 0);
    };
    return btn;
  };

  containers.forEach(container => {
    container.innerHTML = "";

    // 「前へ」ボタン
    container.appendChild(createBtn("‹ 前へ", currentPage - 1, false, currentPage === 1));

    // --- 修正箇所: ページ番号のロジック ---
    const pageNumbers = [];
    // 常に1ページ目を追加
    pageNumbers.push(1);
    
    // 現在位置の前後2ページを計算
    let start = Math.max(2, currentPage - 1);
    let end = Math.min(totalPages - 1, currentPage + 1);

    // 省略記号が必要なら追加（1とstartの間に隙間がある場合）
    if (start > 2) pageNumbers.push("...");
    
    for (let i = start; i <= end; i++) {
      pageNumbers.push(i);
    }
    
    // 省略記号が必要なら追加（endとtotalPagesの間に隙間がある場合）
    if (end < totalPages - 1) pageNumbers.push("...");
    
    // 常に最後のページを追加（totalPagesが1より大きい場合）
    if (totalPages > 1) pageNumbers.push(totalPages);

    // ボタンの描画
    pageNumbers.forEach(p => {
      if (p === "...") {
        container.appendChild(document.createTextNode("..."));
      } else {
        container.appendChild(createBtn(p, p, p === currentPage));
      }
    });
    // ------------------------------------

    // 「次へ」ボタン
    container.appendChild(createBtn("次へ ›", currentPage + 1, false, currentPage === totalPages));
  });
}

/**
 * 1ページ当たりの表示件数を変更
 */
function changePageSize() {
  currentPage = 1;
  displayCards();
}

/**
 * テキスト表示用関数
 */
function toggleTextVisibility() {
  const isEnChecked = document.getElementById('toggle-card-en-text').checked;
  const isJpChecked = document.getElementById('toggle-card-jp-text').checked;
  const enTextElements = document.getElementsByClassName('card-text-en-content');
  const jpTextElements = document.getElementsByClassName('card-text-jp-content');

  // セッションに保存
  sessionStorage.setItem('toggleCardEnText', isEnChecked);
  sessionStorage.setItem('toggleCardJpText', isJpChecked);

  // NodeListではなくHTMLCollectionなのでArray.fromで回すか、単純なfor文で回す
  for (let i = 0; i < enTextElements.length; i++) {
    enTextElements[i].style.display = isEnChecked ? "block" : "none";
    jpTextElements[i].style.display = isJpChecked ? "block" : "none";
  }
}

/**
 * ソートを実行して表示を更新
 */
function applySort() {
  const sortValue = document.getElementById("sort-select").value;
  const currentIds = new Set(filteredCards.map(c => c.uid));
  filteredCards = allCards.filter(c => currentIds.has(c.uid));

  filteredCards.sort((a, b) => {
    switch (sortValue) {
      case 'date-desc': return new Date(b.releaseDate) - new Date(a.releaseDate);
      case 'date-asc':  return new Date(a.releaseDate) - new Date(b.releaseDate);
      case 'name-asc':  return (a.enName || "").localeCompare(b.enName || "");
      case 'name-desc': return (b.enName || "").localeCompare(a.enName || "");
      
      // 数値ソート用ヘルパー（"-" は最後に回す）
      case 'cost-asc':  return compareNumeric(a.totalCost, b.totalCost);
      case 'cost-desc': return compareNumeric(b.totalCost, a.totalCost);
      case 'atk-asc':   return compareNumeric(a.atk, b.atk);
      case 'atk-desc':  return compareNumeric(b.atk, a.atk);
      case 'def-asc':   return compareNumeric(a.def, b.def);
      case 'def-desc':  return compareNumeric(b.def, a.def);
      default: return 0;
    }
  });

  currentPage = 1;
  displayCards();
}

/**
 * 数値比較用ヘルパー（"-"を考慮）
 */
function compareNumeric(valA, valB) {
  const numA = (valA === "-" || valA === "") ? Infinity : valA;
  const numB = (valB === "-" || valB === "") ? Infinity : valB;
  return numA - numB;
}

/**
 * 属性部分をバッジ表示に変換
 */
function getAttriBadgeHtml(attriArray) {
  if (!attriArray || !attriArray.length) return "";
  return attriArray.map(a => {
    const cleanA = a.trim();
    const attriClass = ["光", "炎", "水", "風", "闇"].includes(cleanA) ? `attri-${cleanA}` : 'attri-default';
    return `<span class="badge ${attriClass}">${cleanA}</span>`;
  }).join("");
}

/**
 * コストをバッジ形式に変換する共通関数
 */
function getCostBadgeHtml(costStr) {
  if (!costStr || costStr === "-") return "-";

  // 正規表現: 属性のいずれか1文字 または 連続する数字
  const parts = costStr.match(/光|炎|水|風|闇|月|時|無|X|\d+/g) || costStr.split('');

  return parts.map(part => {
    // 属性リスト（コストの種類）
    const costTypes = ["光", "炎", "水", "風", "闇", "月", "時", "無", "X"];
    const costClass = costTypes.includes(part) ? `cost-${part}` : 'cost-default';

    return `<span class="badge-cost ${costClass}">${part}</span>`;
  }).join('');
}

/**
 * マウスオーバーされたキーワードの表示
 */
function renderKeywordTooltips(cardText) {
  if (!cardText || !keywords || keywords.length === 0) return cardText || "";
  
  let processedText = cardText;
  const placeholderMap = {};
  let placeholderCounter = 0;

  // 1. キーワード一覧を、名前（name）の文字数が長い順にソートする
  // (長いキーワード「Force Resonance」を「Force」より先に処理して誤爆を防ぐため)
  const sortedKeywords = [...keywords].sort((a, b) => {
    const lenA = a.name ? a.name.length : 0;
    const lenB = b.name ? b.name.length : 0;
    return lenB - lenA;
  });

  // 2. 各キーワードごとに置換処理を実行
  sortedKeywords.forEach((kw) => {
    if (!kw.name) return;

    // --- ① 英語名称の抽出 ---
    const bracketMatchEn = kw.name.match(/^(\[[^\]]+\])/);
    if (!bracketMatchEn) return; 
    const baseNameEn = bracketMatchEn[1]; // 例: "[Consensus]"

    // 画面側のcardTextは既にescapeHtmlされているため、比較するキーワード名もエスケープする（2点目の対策）
    const escapedEn = escapeHtml(baseNameEn);
    
    // ツールチップ内の説明文と、置換後のテキスト（match）を安全にエスケープ
    const escapedDesc = escapeHtml(kw.description);

    // 正規表現の特殊文字をエスケープして安全なパターンを作成
    const safePatternEn = escapedEn.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regexEn = new RegExp(safePatternEn, 'g');

    // マッチした場合、ダミータグに一時退避させる（多重置換によるHTML破壊の防止）
    if (regexEn.test(processedText)) {
      processedText = processedText.replace(regexEn, (match) => {
        const placeholder = `__KW_EN_TT_${placeholderCounter}__`;
        placeholderMap[placeholder] = `<span class="keyword-tooltip" data-tooltip="${escapedDesc}">${match}</span>`;
        placeholderCounter++;
        return placeholder;
      });
    }

    // --- ② 日本語名称の抽出と置換処理 ---
    if (kw.jp) {
      const bracketMatchJp = kw.jp.trim().match(/^(\[[^\]]+\])/);
      const baseNameJp = bracketMatchJp ? bracketMatchJp[1] : kw.jp.trim();
      
      const escapedJp = escapeHtml(baseNameJp);
      const safePatternJp = escapedJp.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regexJp = new RegExp(safePatternJp, 'g');

      if (regexJp.test(processedText)) {
        processedText = processedText.replace(regexJp, (match) => {
          const placeholder = `__KW_JP_TT_${placeholderCounter}__`;
          placeholderMap[placeholder] = `<span class="keyword-tooltip" data-tooltip="${escapedDesc}">${match}</span>`;
          placeholderCounter++;
          return placeholder;
        });
      }
    }
  });

  // 3. すべてのキーワード走査が終わった後、退避していたHTMLを一斉に復元する
  Object.keys(placeholderMap).forEach(placeholder => {
    processedText = processedText.replace(new RegExp(placeholder, 'g'), placeholderMap[placeholder]);
  });

  return processedText;
}

/**
 * HTML特殊文字をエスケープする関数
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * HTMLエスケープ文字を元に戻す関数
 */
function unescapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

// ------------------------------------------------------------------------------------------------------------------
// カード詳細表示用関数
// ------------------------------------------------------------------------------------------------------------------

/**
 * カード詳細画面のモジュール表示
 */
function openDetail(cardId) {
  // セッションにカードIDを保存
  sessionStorage.setItem('activeDetailCardId', cardId);
  const targetCard = allCards.find(c => c.uid === cardId);
  if (!targetCard) return;

  // --- 前後のカードナビゲーション処理 ---
  const navContainer = document.getElementById("modal-nav");

  let currentIndex = filteredCards.findIndex(c => c.uid === cardId);
  let targetList = filteredCards;
  
  // 2. filteredCards に含まれていない場合は allCards 全体をベースにする（フォールバック）
  if (currentIndex === -1) {
    currentIndex = allCards.findIndex(c => c.uid === cardId);
    targetList = allCards;
  }

  if (currentIndex !== -1 && targetList.length > 1) {
    const prevCard = targetList[currentIndex - 1];
    const nextCard = targetList[currentIndex + 1];

    const prevBtnHtml = prevCard 
      ? `<button class="modal-nav-btn" onclick="openDetail('${prevCard.uid}')">← 前のカード</button>`
      : `<button class="modal-nav-btn" disabled>← 前のカード</button>`;

    const nextBtnHtml = nextCard 
      ? `<button class="modal-nav-btn" onclick="openDetail('${nextCard.uid}')">次のカード →</button>`
      : `<button class="modal-nav-btn" disabled>次のカード →</button>`;

    const counterHtml = `<span class="modal-nav-counter">${currentIndex + 1} / ${targetList.length}</span>`;

    navContainer.innerHTML = `
      <div class="modal-nav-bar">
        ${prevBtnHtml}
        ${counterHtml}
        ${nextBtnHtml}
      </div>
    `;
    navContainer.style.display = "block";
  } else {
    navContainer.innerHTML = "";
    navContainer.style.display = "none";
  }

  // 同じNo（id）を持つカードをすべて抽出する
  const siblings = allCards.filter(c => c.id === targetCard.id);
  siblings.sort((a, b) => {
    if (a.uid === cardId) return -1; // aを先に持ってくる
    if (b.uid === cardId) return 1;  // bを先に持ってくる
    return 0; // それ以外は順序維持
  });

  let modalContent = "";
  siblings.forEach(card => {
    // バッジ作成用
    const typesHtml = card.types && card.types.length ? card.types.map(t => `<span>${t}</span>`).join("・") : "";

    const racesHtml = card.races && card.races.length ? card.races.map(race => {
      const enName = race.trim();
      const jpName = raceMapping[enName];
      // リンクボタンの表示名: 日本語があれば「英語(日本語)」とする
      const displayName = jpName ? `${enName}(${jpName})` : enName;
      // createSearchLinkを使ってリンクボタン化
      return createSearchLink('race', enName, displayName);
    }).join(" ・ ") : ""; // 区切り文字として「・」を配置

    const attrisHtml = getAttriBadgeHtml(card.attris) || "-";
    
    // カードタイプ・種族の結合表示
    let typeAndRace = "";
    if (typesHtml && racesHtml) {
      typeAndRace = `${typesHtml} - ${racesHtml}`;
    } else {
      typeAndRace = typesHtml || racesHtml || "-";
    }

    // ステータス欄の判定ロジック
    const isInvalid = (val) => {
      // 数値の0、または文字列の'0'なら即座に「有効（false）」と判定する
      if (val === 0 || val === '0') return false; 
      return !val || String(val).trim() === "" || String(val).trim() === "-";
    };
    let statusSectionHtml = "";
    if (!isInvalid(card.divinity) || !isInvalid(card.willpower) || !isInvalid(card.atk) || !isInvalid(card.def)) {
      let boxesHtml = "";
      if (!isInvalid(card.divinity)) boxesHtml += `<div class="status-box"><div>神力</div><div class="status-val">${card.divinity}</div></div>`;
      if (!isInvalid(card.willpower)) boxesHtml += `<div class="status-box"><div>ウィルパワー</div><div class="status-val">${card.willpower}</div></div>`;
      if (!isInvalid(card.atk)) boxesHtml += `<div class="status-box"><div>ATK</div><div class="status-val">${card.atk}</div></div>`;
      if (!isInvalid(card.def)) boxesHtml += `<div class="status-box"><div>DEF</div><div class="status-val">${card.def}</div></div>`;
      statusSectionHtml = `
        <div class="modal-section">
          <div class="modal-section-title">ステータス</div>
          <div class="grid-status">${boxesHtml}</div>
        </div>
      `;
    }

    // フレイバーテキストのセクションを動的に生成
    let flavorSectionHtml = "";
    const hasEn = card.enFlavor && card.enFlavor.trim() !== "" && card.enFlavor.trim() !== "-";
    const hasJp = card.jpFlavor && card.jpFlavor.trim() !== "" && card.jpFlavor.trim() !== "-";
    const hasTrans = card.transFlavor && card.transFlavor.trim() !== "";

    if (hasEn || hasJp) {
      let transHtml = "";
      
      // 日本語版がなく、自動意訳が存在する場合はツールチップ化
      if (!hasJp && hasTrans) {
        const escapedTrans = escapeHtml(card.transFlavor);
        transHtml = `
          <div style="margin-top: 6px; font-size: 12px; color: #0284c7;">
            <span class="keyword-tooltip" data-tooltip="${escapedTrans}" style="cursor: pointer; text-decoration: underline dotted;">
              💡 自動翻訳を表示
            </span>
          </div>
        `;
      }

      flavorSectionHtml = `
        <div class="modal-section">
          <div class="modal-section-title">フレイバーテキスト</div>
          ${hasEn ? `<div class="flavor-block" style="color:#64748b;">${card.enFlavor}</div>` : ''}
          ${hasJp ? `<div class="flavor-block">${card.jpFlavor}</div>` : ''}
          ${transHtml}
        </div>
      `;
    }

    // --- 逆引きリファレンス（カード名キーでのチェック） ---
    // キーを card.uid から すべてのカードで一意に存在する card.enName に変更
    const referenceDataList = cardReferenceMap[card.enName] || [];

    const referenceItems = referenceDataList
      .map(refInfo => {
        // GAS側で格納した、参照元カードのUIDを直接使って最新カード情報を取得
        // ※最新版のみに遷移させたい場合は、latestCardMap[refInfo.enName] を使うやり方でも大丈夫です
        const refCardId = latestCardMap[refInfo.enName];
        if (!refCardId) return "";

        const refCard = allCards.find(c => c.uid === refCardId);
        if (!refCard) return "";

        // 表示は日本語名があれば併記
        const displayName = refCard.jpName ? `${refCard.enName} (${refCard.jpName})` : refCard.enName;

        return `
          <div class="reprint-item" 
              onclick="openDetail('${refCard.uid}')" 
              style="cursor: pointer; padding: 6px 8px; border-bottom: 1px solid #f1f5f9; transition: background 0.2s;">
            <span style="color: #3b82f6; font-size: 13px;">${displayName}</span>
          </div>`;
      })
      .join("");

    const referenceSection = referenceItems ? `
      <div class="modal-section">
        <div class="modal-section-title">このカードを参照しているカード</div>
        <div style="border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; max-height: 150px; overflow-y: auto;">
          ${referenceItems}
        </div>
      </div>
    ` : "";

    // 再録情報のセクションを動的に生成
    const reprints = allCards
    .filter(c => c.enName === card.enName && c.id !== card.id)
    .map(c => {
      // クリック時にこのカードのモーダルを開く関数を定義
      // onclickの中で openDetail(c.uid) を呼び出します
      return `
        <div class="reprint-item" 
            onclick="openDetail('${c.uid}')" 
            style="cursor: pointer; padding: 4px 8px; border-bottom: 1px solid #f1f5f9; transition: background 0.2s;">
          <span style="color: #3b82f6;">${c.expansion} : ${c.id}</span>
        </div>`;
    })
    .join("");
    const reprintSection = reprints ? `
      <div class="modal-section">
        <div class="modal-section-title">再録情報 (他の収録弾)</div>
        <div style="border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden;">
          ${reprints}
        </div>
      </div>
    ` : "";

    // 禁止カード情報のセクションを動的に生成
    let banSectionHtml = "";
    if (card.bans && card.bans.length > 0) {
      const banItems = card.bans.map(b => {
        let label = `<span class="ban-badge ban-type-${b.type}">${b.type}</span> <strong>${b.format}</strong>`;
        if (b.type === "コンビ禁止" && b.pair) {
          // ペアカードが存在する場合は詳細画面へのリンクボタン化
          const pairUid = latestCardMap[b.pair];
          const pairHtml = pairUid ? `<button class="link-btn" onclick="openDetail('${pairUid}')">${b.pair}</button>` : b.pair;
          label += ` (コンビ先: ${pairHtml})`;
        }
        return `<div style="padding: 4px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13px;">${label}</div>`;
      }).join("");

      banSectionHtml = `
        <div class="modal-section" style="border-left: 3px solid #ef4444;">
          <div class="modal-section-title" style="color: #dc2626;">禁止情報</div>
          <div>${banItems}</div>
        </div>
      `;
    }

    // 外部サイトへのリンクボタンを生成
    const officialLink = getOfficialLink(card.id);

    modalContent += `
      <div class="modal-title">
        <h2 style="margin: 0; font-size: 20px; color: #1e293b;">${card.enName || '（No English Name）'}</h2>
        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px; font-weight: bold;">${card.jpName || ''}</p>
      </div>

      <div class="modal-section">
        <div style="font-size: 14px; margin-bottom: 10px;">
          <div style="margin-bottom: 4px;"><strong>属性:</strong> ${attrisHtml}</div>
          <div style="margin-bottom: 4px;"><strong>コスト:</strong> ${getCostBadgeHtml(card.cost)}</div>
          <div><strong>カードタイプ - 種族:</strong> ${typeAndRace}</div>
        </div>
      </div>

      ${statusSectionHtml}

      <div class="modal-section">
        <div class="modal-section-title">テキスト</div>
        <div class="text-block" style="color: #475569; font-size: 12px;">${renderCardLinks(renderKeywordTooltips(escapeHtml(card.enText || '(No text available)')))}</div>
        <div class="text-block" style="color: #0f172a; font-weight: 500;">${renderCardLinks(renderKeywordTooltips(escapeHtml(card.jpText || '（効果テキストなし）')))}</div>
      </div>

      ${flavorSectionHtml}

      <div class="modal-section">
        <div class="modal-section-title">収録弾情報</div>
        <div style="font-size: 13px; line-height: 1.8;">
          <div><strong>収録弾:</strong> ${createSearchLink('exp', card.expansionCode, card.expansion)}</div>
          ${card.expansionJp ? `<div><strong>日本語名称:</strong> ${card.expansionJp}</div>` : ''}
          <div><strong>No:</strong> ${card.id || '-'}</div>
          <div><strong>レアリティ:</strong> ${card.rarity || '-'}</div>
          <div><strong>イラストレーター:</strong> ${card.illustrators.map(illustrator => {return createSearchLink('illustrator', illustrator, illustrator)})}</div>
        </div>
      </div>

      ${referenceSection}

      ${reprintSection}

      ${banSectionHtml}

      <div class="modal-section">
        <div class="modal-section-title">外部サイト</div>
        <div style="margin-top: 20px;">
          <a href="${officialLink}" target="_blank" class="external-link-btn">
            Force of Windで画像を確認する
          </a>
        </div>
      </div>
    `;
  });
  const modalBody = document.getElementById("modal-body");
  modalBody.innerHTML = modalContent;

  // すでにモーダルが開いている（bodyがfixedになっている）場合は、元の位置を維持するためtopを更新しない
  if (document.body.style.position !== 'fixed') {
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
  }

  // モーダルを表示する処理
  document.getElementById("detail-modal").style.display = "flex";
  // スクロールをトップに戻す
  document.querySelector(".modal-content").scrollTop = 0; 
}

/**
 * リンク検索用のボタンHTMLを生成（クォート対策版）
 */
function createSearchLink(type, value, displayName) {
  const display = displayName || value;
  
  // 1. 引数となる value を JSON文字列化する (" や ' を含む文字列が安全になる)
  //    例: "Crimson Moon's" -> "\"Crimson Moon's\""
  const jsonValue = JSON.stringify(value);
  
  // 2. HTML属性として安全にするため、ダブルクォートをエスケープする
  //    HTML上では onclick="..." となるため、中のダブルクォートを &quot; に変える
  const escapedHtmlValue = jsonValue.replace(/"/g, "&quot;");
  
  // 3. onclick内ではエスケープ済みの値を渡す
  return `<button class="link-btn" onclick="searchByProperty('${type}', ${escapedHtmlValue})">
            ${display}
          </button>`;
}

/**
 * テキスト内の「カード名」や "カード名"、『カード名』を、詳細画面を開くリンクに置換する関数
 */
function renderCardLinks(text) {
  if (!text) return "";
  let processedText = text;

  // 1. カギかっこ（「」）と 二重カギかっこ（『』）の処理（変更なし）
  const regexBracket = /(「([^「」『』]+)」|『([^「」『』]+)』)/g;
  processedText = processedText.replace(regexBracket, (match, fullMatch, nameJp1, nameJp2) => {
    const rawMatchedName = (nameJp1 || nameJp2 || "").trim();
    const matchedName = unescapeHtml(rawMatchedName);
    const targetUid = latestCardMap[matchedName];
    if (targetUid) {
      const btn = `<button class="link-btn" onclick="openDetail('${targetUid}')" title="カード詳細を見る">${rawMatchedName}</button>`;
      return match.startsWith("「") ? `「${btn}」` : `『${btn}』`;
    }
    return match;
  });

  // 2. ダブルクォーテーション（&quot;）のすべての区間（1-2, 2-3, 3-4...）を連鎖判定する処理
  // 全角クォーテーション（“ や ”）を一時的に &quot; に統一して統一処理
  processedText = processedText.replace(/[“”]/g, "&quot;");

  // &quot; でテキストを分解（区切り文字自体も保持するため正規表現グループ化）
  const parts = processedText.split(/(&quot;)/g);

  // parts のイメージ: ["文章0", "&quot;", "文章1", "&quot;", "文章2", "&quot;", ...]
  let result = "";
  let i = 0;

  while (i < parts.length) {
    // クォーテーションでない部分はそのまま結合
    if (parts[i] !== "&quot;") {
      result += parts[i];
      i++;
      continue;
    }

    // parts[i] が "&quot;" の場合、次のクォーテーション（parts[j]）を探す
    let foundMatch = false;

    for (let j = i + 2; j < parts.length; j += 2) {
      // i と j の間のテキストを取り出す
      const betweenText = parts.slice(i + 1, j).join("");
      const trimmedName = betweenText.trim();
      const matchedName = unescapeHtml(trimmedName);

      // マップにカード名が存在するかチェック
      if (matchedName && latestCardMap[matchedName]) {
        const targetUid = latestCardMap[matchedName];
        const btn = `<button class="link-btn" onclick="openDetail('${targetUid}')" title="カード詳細を見る">${trimmedName}</button>`;
        
        // ヒットした場合：開始クォート + ボタン + 終了クォート を結合
        result += `&quot;${btn}`;
        
        // 次の検索開始位置を、この終点クォーテーション（j）の位置にセット
        i = j;
        foundMatch = true;
        break;
      }
    }

    // どの区間でもカード名にヒットしなかった場合、この &quot; は通常の文字として出力して次へ
    if (!foundMatch) {
      result += parts[i];
      i++;
    }
  }
  return result;
}

/**
 * 汎用的な絞り込み検索関数
 * @param {string} propertyName - 検索対象のプロパティ名 (exp, race, illustrator など)
 * @param {string} value - 検索したい値
 */
function searchByProperty(propertyName, value) {
  // 詳細検索の入力値をすべてクリア（既存の関数を利用）
  resetDetailedSearch();
  
  // 詳細検索へ切り替え
  switchTab('detailed');
  
  // 今回の対象項目だけにチェックを入れる
  const prefixMap = {
    'exp': 'chk-exp',
    'race': 'chk-race',
    'illustrator': 'chk-illustrator',
    'type': 'chk-type'
  };

  const className = prefixMap[propertyName];
  const checkboxes = document.querySelectorAll(`.${className}`);
  
  checkboxes.forEach(cb => {
    if (cb.value === value) cb.checked = true;
  });
  
  // 該当するプレフィックスのバッジを明示的に更新する
  if (prefixMap[propertyName]) {
    updateSelectedTags(prefixMap[propertyName]);
  }

  // 検索を実行
  searchDetailedCards();
  
  // モーダルを閉じる
  closeModal();
  
  // 背景の固定を解除（※closeDetailで行っている処理と同じものを実行）
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';

  // 検索結果トップへスクロール
  window.scrollTo(0, 0);
}

/**
 * No.から外部サイトのURLを生成する関数
 */
function getOfficialLink(cardNo) {
  // 外部サイトのURL構造に合わせる（例: 公式DBの場合）
  const baseUrl = "https://www.forceofwind.online/card/";
  return `${baseUrl}${cardNo}`;
}

/**
 * 詳細画面を閉じる
 */
function closeModal() {
  document.getElementById("detail-modal").style.display = "none";
  // 元の画面のスクロールを許可する
  // 1. bodyの固定を解除
  const scrollY = document.body.style.top;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  // 2. 元のスクロール位置に戻す
  window.scrollTo(0, parseInt(scrollY || '0') * -1);
  // セッションのカードID情報を削除
  sessionStorage.removeItem('activeDetailCardId');
}

/**
 * カード詳細のキーダウン操作用イベントリスナー
 * キーボード（Escキー）でモーダルを閉じる
 * 右矢印で次のカード
 * 左矢印で前のカード
 */
document.addEventListener('keydown', (e) => {
  const detailModal = document.getElementById("detail-modal");
  
  // モーダルが表示されていない場合は処理しない
  if (!detailModal || detailModal.style.display !== "flex") return;

  // テキスト入力中などはキーボードショートカットを無効化
  const activeEl = document.activeElement;
  if (activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName)) return;

  if (e.key === 'Escape') {
    const detailModal = document.getElementById("detail-modal");
    if (detailModal && detailModal.style.display === "flex") {
      closeModal();
    }
  }

  // 左右矢印キー：カード移動
  if (e.key === 'ArrowLeft') {
    const prevBtn = document.querySelector('.modal-nav-btn:not(:disabled)');
    // 「前のカード」ボタンが存在し、かつ活性状態であれば実行
    const btns = document.querySelectorAll('.modal-nav-btn');
    if (btns[0] && !btns[0].disabled) {
      btns[0].click();
    }
  } else if (e.key === 'ArrowRight') {
    const btns = document.querySelectorAll('.modal-nav-btn');
    if (btns[1] && !btns[1].disabled) {
      btns[1].click();
    }
  }
});

// ------------------------------------------------------------------------------------------------------------------
// キーワードツールチップ表示用関数
// ------------------------------------------------------------------------------------------------------------------

/**
 * ツールチップ要素を取得・生成
 */
function getKeywordTooltipPopup() {
  let popup = document.getElementById("keyword-tooltip-popup");

  if (!popup) {
    popup = document.createElement("div");
    popup.id = "keyword-tooltip-popup";
    document.body.appendChild(popup);
  }
  return popup;
}

/**
 * ツールチップを表示
 */
function showKeywordTooltip(keywordElement) {
  if (!keywordElement) return;

  const description = keywordElement.dataset.tooltip;
  if (!description) return;

  const popup = getKeywordTooltipPopup();

  popup.textContent = description;

  // 一旦表示可能な状態にしてサイズを取得
  popup.classList.add("is-visible");

  // キーワードのviewport上の位置
  const rect = keywordElement.getBoundingClientRect();

  // ツールチップのサイズ
  const popupRect = popup.getBoundingClientRect();

  const margin = 12;
  const gap = 8;

  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;

  // X方向
  // 基本はキーワードの左端に合わせる。
  let left = rect.left;
  // 右にはみ出すなら左へずらす
  if (left + popupRect.width > viewportWidth - margin) {
    left = viewportWidth - popupRect.width - margin;
  }
  // 左にはみ出すことも防止
  left = Math.max(margin, left);

  // Y方向
  // 基本はキーワードの上側に表示
  let top = rect.top - popupRect.height - gap;
  // 上に収まらないなら下側へ
  if (top < margin) {
    top = rect.bottom + gap;
  }
  // 下側にも収まらない場合、画面内に収まる位置まで強制的に調整
  if (top + popupRect.height > viewportHeight - margin) {
    top = viewportHeight - popupRect.height - margin;
  }
  // 最終的なY座標も画面内に収める
  top = Math.max(margin, top);

  // 位置を適用
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  activeKeywordTooltip = keywordElement;
}

/**
 * ツールチップを閉じる
 */
function hideKeywordTooltip() {
  const popup = document.getElementById("keyword-tooltip-popup");
  if (popup) {
    popup.classList.remove("is-visible");
  }
  activeKeywordTooltip = null;
}

/**
 * キーワードツールチップのイベント設定
 * イベントデリゲーションを使うことで、
 * displayCards() や openDetail() で後から生成された
 * keyword-tooltip にも自動的に対応する。
 */
document.addEventListener("pointerover", function(event) {

  const keywordElement = event.target.closest(".keyword-tooltip");

  if (!keywordElement) return;

  //タッチ端末では pointerover を使ったホバー表示を行わない。
  if (event.pointerType === "touch") return;

  clearTimeout(keywordTooltipTimer);

  keywordTooltipTimer = setTimeout(() => {
    showKeywordTooltip(keywordElement);
  }, 80);
});

/**
 * PCのマウスがキーワードから離れたら閉じる
 */
document.addEventListener("pointerout", function(event) {

  const keywordElement = event.target.closest(".keyword-tooltip");

  if (!keywordElement) return;

  if (event.pointerType === "touch") return;

  // 子要素へ移動しただけの場合は無視
  if (event.relatedTarget &&
      keywordElement.contains(event.relatedTarget)) {
    return;
  }

  clearTimeout(keywordTooltipTimer);
  hideKeywordTooltip();
});

/**
 * タップ・クリック
 * スマホではこちらがメイン
 */
document.addEventListener("click", function(event) {
  const keywordElement = event.target.closest(".keyword-tooltip");

  if (keywordElement) {
    // 同じキーワードをもう一度タップしたら閉じる
    if (activeKeywordTooltip === keywordElement) {
      hideKeywordTooltip();
    } else {
      showKeywordTooltip(keywordElement);
    }
    return;
  }
  //キーワード以外をクリックしたら閉じる
  hideKeywordTooltip();
});

/**
 * スクロールしたらツールチップを閉じる
 * スマホでスクロール中にツールチップだけ取り残されるのを防ぐ
 */
window.addEventListener("scroll", function() {
  hideKeywordTooltip();
}, { passive: true });

/**
 * 画面サイズ変更時も閉じる
 */
window.addEventListener("resize", function() {
  hideKeywordTooltip();
});

// ------------------------------------------------------------------------------------------------------------------
// キーワード一覧表示用関数
// ------------------------------------------------------------------------------------------------------------------

/**
 * キーワードモーダルを開く関数
 */
function openKeywordModal() {
  const contentDiv = document.getElementById('keyword-modal-content');
  if (!contentDiv) return;

  if (keywords.length === 0) {
    contentDiv.innerHTML = "<p style='color: #666;'>キーワードデータがありません。</p>";
  } else {
    // マスタの内容からHTMLを生成
    let html = '<ul style="list-style: none; padding-left: 0; margin: 0;">';
    for(kw of keywords) {
      if(kw.category === "キーワード")continue;
      html += `
        <li style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed #eee;">
          <strong style="font-size: 14px; color: #333; background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${kw.name}</strong> 
          ${kw.jp ? `<span style="color: #666; font-size: 12px;">(${kw.jp})</span>` : ''}
          <div style="font-size: 13px; color: #444; margin-top: 4px; padding-left: 6px; border-left: 3px solid #ccc;">${kw.description}</div>
        </li>
      `;
    };
    html += '</ul>';
    contentDiv.innerHTML = html;
  }
  // モーダルを表示
  document.getElementById('keyword-list-modal').style.display = 'block';
}

// キーワードモーダルを閉じる関数
function closeKeywordModal() {
  document.getElementById('keyword-list-modal').style.display = 'none';
}

// モーダルの外側をクリックしたときも閉じるようにする設定
window.addEventListener('click', function(event) {
  const modal = document.getElementById('keyword-list-modal');
  if (event.target === modal) {
    closeKeywordModal();
  }
});

// ------------------------------------------------------------------------------------------------------------------
// セッション管理用関数
// ------------------------------------------------------------------------------------------------------------------

/**
 * 検索条件をセッションストレージに保存する関数
 */
function saveSearchConditionsToCache() {
  // 1. 基本となる構造を準備
  const searchState = {
    basicKeyword: document.getElementById('search-input')?.value || "",
    importList: document.getElementById('import-text-input')?.value || "",

    // 動的に入れる詳細検索フォーム用オブジェクト
    detailedForm: {},

    // チェックボックス群（動的に生成される項目など）
    chkType: Array.from(document.querySelectorAll('.chk-type:checked')).map(el => el.value),
    chkRace: Array.from(document.querySelectorAll('.chk-race:checked')).map(el => el.value),
    chkExp: Array.from(document.querySelectorAll('.chk-exp:checked')).map(el => el.value),
    chkRarity: Array.from(document.querySelectorAll('.chk-rarity:checked')).map(el => el.value),
    chkIllustrator: Array.from(document.querySelectorAll('.chk-illustrator:checked')).map(el => el.value),

    // ナビゲーション・表示・コントロール系
    pageSize: document.getElementById('page-size-select')?.value || "30",
    sortSelect: document.getElementById('sort-select')?.value || "date-desc",
    currentPage: currentPage || 1
  };

  // 2. INITIAL_FORM_VALUES のキー（id）をループ処理して詳細検索の値をセット
  Object.keys(INITIAL_FORM_VALUES).forEach(id => {
    const el = document.getElementById(id);
    if (!el) {
      searchState.detailedForm[id] = INITIAL_FORM_VALUES[id];
      return;
    }

    if (el.type === 'checkbox') {
      searchState.detailedForm[id] = el.checked;
    } else {
      searchState.detailedForm[id] = el.value;
    }
  });

  // JSON文字列に変換して保存
  sessionStorage.setItem('fow_search_cache', JSON.stringify(searchState));
  //console.log("検索条件をセッションに保存しました。");
}

/** 
 * キャッシュから検索条件を読み込んで画面に復元する関数
 */
function restoreSearchConditionsFromCache() {
  const cacheData = sessionStorage.getItem('fow_search_cache');
  if (!cacheData) return; // キャッシュが無ければ何もしない

  try {
    const searchState = JSON.parse(cacheData);

    // 1. テキスト入力・基本検索の復元
    if (document.getElementById('search-input') && searchState.basicKeyword !== undefined) {
      document.getElementById('search-input').value = searchState.basicKeyword;
    }
    if (document.getElementById('import-text-input') && searchState.importList !== undefined) {
      document.getElementById('import-text-input').value = searchState.importList;
    }

    // 2. 詳細検索フォーム（INITIAL_FORM_VALUES構造）の復元
    if (searchState.detailedForm) {
      Object.keys(INITIAL_FORM_VALUES).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        // 保存された値があればそれを使う。なければ初期値を使う
        const savedVal = (searchState.detailedForm[id] !== undefined) 
          ? searchState.detailedForm[id] 
          : INITIAL_FORM_VALUES[id];

        if (el.type === 'checkbox') {
          el.checked = savedVal;
        } else {
          el.value = savedVal;
        }
      });
    }

    // 3. 共通チェックボックス群（クラス指定のもの）の復元
    const restoreClassCheckboxes = (className, savedValues) => {
      if (!savedValues || !Array.isArray(savedValues)) return;
      document.querySelectorAll(`.${className}`).forEach(cb => {
        cb.checked = savedValues.includes(cb.value);
      });
    };

    restoreClassCheckboxes('chk-type', searchState.chkType);
    restoreClassCheckboxes('chk-race', searchState.chkRace);
    restoreClassCheckboxes('chk-exp', searchState.chkExp);
    restoreClassCheckboxes('chk-rarity', searchState.chkRarity);
    restoreClassCheckboxes('chk-illustrator', searchState.chkIllustrator);

    // バッジ（タグ）表示の更新
    ['chk-type', 'chk-race', 'chk-exp', 'chk-rarity', 'chk-illustrator'].forEach(prefix => {
      if (typeof updateSelectedTags === 'function') updateSelectedTags(prefix);
    });

    // 4. ナビゲーション・表示状態・ページの復元
    if (document.getElementById('page-size-select') && searchState.pageSize) {
      document.getElementById('page-size-select').value = searchState.pageSize;
    }
    if (document.getElementById('sort-select') && searchState.sortSelect) {
      document.getElementById('sort-select').value = searchState.sortSelect;
    }
    if (document.getElementById('toggle-card-en-text') && sessionStorage.getItem('toggleCardEnText') !== undefined) {
      document.getElementById('toggle-card-en-text').checked = sessionStorage.getItem('toggleCardEnText') === "true";
    }
    if (document.getElementById('toggle-card-jp-text') && sessionStorage.getItem('toggleCardJpText') !== undefined) {
      document.getElementById('toggle-card-jp-text').checked = sessionStorage.getItem('toggleCardJpText') === "true";
    }

    if (searchState.currentPage) {
      currentPage = searchState.currentPage;
    }

    //console.log("セッションから検索条件を復元しました。");

  } catch (e) {
    console.error("キャッシュの復元中にエラーが発生しました:", e);
    sessionStorage.removeItem('fow_search_cache');
  }
}

/**
 * セッション情報を読み込んで状態と検索を復元する関数
 */
function restoreSearchSession() {
  // セッションから保存されたタブを取得（未保存の場合はデフォルト ''）
  const savedTab = sessionStorage.getItem('activeSearchTab') || '';

  // UIのタブ表示を復元
  switchTab(savedTab === '' ? 'basic' : savedTab);

  // 復元されたタブに応じて対応する既存の検索関数を実行
  // ※この中で displayCards() が呼ばれ、DOMが生成されます
  switch (savedTab) {
    case 'basic':
      if (typeof searchCards === 'function') searchCards(true);
      break;
    case 'detailed':
      if (typeof searchDetailedCards === 'function') searchDetailedCards(true);
      break;
    case 'import':
      if (typeof searchImportedCards === 'function') searchImportedCards(true);
      break;
    default:
      break;
  }

  // ブラウザの描画準備が完了したフレームでスクロールとモーダル展開を一括実行
  requestAnimationFrame(() => {
    // スクロール位置の復元
    const savedScrollY = sessionStorage.getItem('scrollY');
    if (savedScrollY) {
      window.scrollTo(0, parseInt(savedScrollY, 10));
    }

    // スクロール完了直後に詳細モーダルを開く
    const activeCardId = sessionStorage.getItem('activeDetailCardId');
    if (activeCardId) {
      openDetail(activeCardId);
    }
  });
}

