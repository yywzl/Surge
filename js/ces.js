const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const cheerio = createCheerio();

// 配置常量抽离（便于维护）
const CONFIG = {
    ENLOAD_KEY: 'enload',
    DEFAULT_PAGE: 1,
    M3U8_PREFIX: 'https://surrit.com/',
    M3U8_SUFFIX: '/playlist.m3u8',
    UUID_REGEX: /nineyu\.com\\\/(.+)\\\/seek\\\/_0\.jpg/,
    SELECTORS: {
        actressContainer: '.max-w-full.p-8.text-nord4.bg-nord1.rounded-lg',
        actressItem: '.space-y-4',
        videoItem: '.thumbnail',
        videoHref: '.text-secondary',
        videoCover: '.w-full',
        videoRemarks: '.left-1',
        videoDuration: '.right-1'
    },
    ERROR_MESSAGES: {
        noActress: '没有找到收藏的女优',
        savedEmpty: '暂无收藏内容'
    }
};

// 解析配置（简化逻辑）
let $config = argsify($config_str) || {};
const appConfig = {
    ver: 1,
    title: 'missav',
    site: 'https://missav.ai',
    tabs: [
        { name: '中文字幕', ui: 1, ext: { id: 'dm265/cn/chinese-subtitle' } },
        { name: '最近更新', ui: 1, ext: { id: 'dm513/cn/new' } },
        { name: '新作上市', ui: 1, ext: { id: 'dm509/cn/release' } },
        { name: '我的收藏', ui: 1, ext: { id: 'saved' } },
        { name: '无码流出', ui: 1, ext: { id: 'dm561/cn/uncensored-leak' } },
        { name: 'VR', ui: 1, ext: { id: 'dm2091/cn/genres/VR' } },
        { name: '今日热门', ui: 1, ext: { id: 'dm242/cn/today-hot' } },
        { name: '本週热门', ui: 1, ext: { id: 'dm168/cn/weekly-hot' } },
        { name: '本月热门', ui: 1, ext: { id: 'dm207/cn/monthly-hot' } },
        { name: 'SIRO', ui: 1, ext: { id: 'dm23/cn/siro' } },
        { name: 'LUXU', ui: 1, ext: { id: 'dm20/cn/luxu' } },
        { name: 'GANA', ui: 1, ext: { id: 'dm17/cn/gana' } },
        { name: 'PRESTIGE PREMIUM', ui: 1, ext: { id: 'dm14/cn/maan' } },
        { name: 'S-CUTE', ui: 1, ext: { id: 'dm23/cn/scute' } },
        { name: 'ARA', ui: 1, ext: { id: 'dm19/cn/ara' } },
        { name: 'FC2', ui: 1, ext: { id: 'dm95/cn/fc2' } },
        { name: 'HEYZO', ui: 1, ext: { id: 'dm628/cn/heyzo' } },
        { name: '东京热', ui: 1, ext: { id: 'dm29/cn/tokyohot' } },
        { name: '一本道', ui: 1, ext: { id: 'dm58345/cn/1pondo' } },
        { name: 'Caribbeancom', ui: 1, ext: { id: 'dm124158/cn/caribbeancom' } },
        { name: 'Caribbeancompr', ui: 1, ext: { id: 'dm1442/cn/caribbeancompr' } },
        { name: '10musume', ui: 1, ext: { id: 'dm58632/cn/10musume' } },
        { name: 'pacopacomama', ui: 1, ext: { id: 'dm668/cn/pacopacomama' } },
        { name: 'Gachinco', ui: 1, ext: { id: 'dm135/cn/gachinco' } },
        { name: 'XXX-AV', ui: 1, ext: { id: 'dm26/cn/xxxav' } },
        { name: '人妻斩', ui: 1, ext: { id: 'dm24/cn/marriedslash' } },
        { name: '顽皮 4610', ui: 1, ext: { id: 'dm19/cn/naughty4610' } },
        { name: '顽皮 0930', ui: 1, ext: { id: 'dm22/cn/naughty0930' } },
        { name: '麻豆传媒', ui: 1, ext: { id: 'dm34/cn/madou' } },
        { name: 'TWAV AV', ui: 1, ext: { id: 'dm17/cn/twav' } },
        { name: 'Furuke AV', ui: 1, ext: { id: 'dm15/cn/furuke' } }
    ]
};

// 工具函数：统一请求处理（增加容错）
async function fetchWithRetry(url, maxRetry = 2) {
    for (let i = 0; i < maxRetry; i++) {
        try {
            const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } });
            if (data.includes('Just a moment...')) {
                $utils.openSafari(url, UA);
                return null; // 反爬拦截，返回空
            }
            return data;
        } catch (err) {
            console.error(`请求失败（${i+1}/${maxRetry}）：`, err.message);
            if (i === maxRetry - 1) throw err; // 最后一次重试失败抛出错误
            await new Promise(resolve => setTimeout(resolve, 1000 * (i+1))); // 延时重试
        }
    }
}

// 优化：女优列表抓取（简化DOM操作）
async function getactress() {
    const url = `${appConfig.site}/saved/actresses`;
    const data = await fetchWithRetry(url);
    if (!data) return [];

    const $ = cheerio.load(data);
    const $container = $(CONFIG.SELECTORS.actressContainer);
    
    if (!$container.length) {
        $utils.openSafari(url, UA);
        return [];
    }

    const list = [];
    try {
        $container.find(CONFIG.SELECTORS.actressItem).each((_, e) => {
            const $e = $(e);
            const href = $e.find('a:first').attr('href')?.replace(appConfig.site + '/', '') || '';
            const name = $e.find('h4').text().trim() || '';
            if (href && name) { // 过滤无效数据
                list.push({ name, ui: 1, ext: { id: href } });
            }
        });
    } catch (e) {
        $utils.toastError(CONFIG.ERROR_MESSAGES.noActress);
    }
    return list;
}

// 优化：配置获取（简化对象拷贝）
async function getConfig() {
    const config = JSON.parse(JSON.stringify(appConfig)); // 深拷贝避免污染原配置
    if ($config[CONFIG.ENLOAD_KEY]) {
        const actressList = await getactress();
        config.tabs = [...config.tabs, ...actressList]; // 展开运算符更简洁
    }
    return jsonify(config);
}

// 优化：视频列表解析（抽取通用逻辑）
function parseVideoList($) {
    const cards = [];
    $(CONFIG.SELECTORS.videoItem).each((_, e) => {
        const $e = $(e);
        const href = $e.find(CONFIG.SELECTORS.videoHref).attr('href') || '';
        const title = $e.find(CONFIG.SELECTORS.videoHref).text().trim().replace(/\s+/g, ' ') || '';
        const cover = $e.find(CONFIG.SELECTORS.videoCover).attr('data-src') || '';
        const remarks = $e.find(CONFIG.SELECTORS.videoRemarks).text().trim() || '';
        const duration = $e.find(CONFIG.SELECTORS.videoDuration).text().trim() || '';

        if (href && title) { // 过滤无效视频
            cards.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: remarks,
                vod_duration: duration,
                ext: { url: href }
            });
        }
    });
    return cards;
}

// 优化：分类视频抓取（复用解析逻辑）
async function getCards(ext) {
    ext = argsify(ext) || {};
    const { page = CONFIG.DEFAULT_PAGE, id } = ext;

    // 我的收藏为空判断优化
    if (id === 'saved' && !$config[CONFIG.ENLOAD_KEY]) {
        $utils.toastError(CONFIG.ERROR_MESSAGES.savedEmpty);
        return jsonify({ list: [] });
    }

    const url = `${appConfig.site}/${id}?page=${page}`;
    const data = await fetchWithRetry(url);
    if (!data) return jsonify({ list: [] });

    const $ = cheerio.load(data);
    const cards = parseVideoList($);
    return jsonify({ list: cards });
}

// 优化：播放链接提取（正则常量化，逻辑更清晰）
async function getTracks(ext) {
    ext = argsify(ext) || {};
    const { url } = ext;
    const tracks = [];

    const data = await fetchWithRetry(url);
    if (!data) return jsonify({ list: [{ title: '默认分组', tracks }] });

    const match = data.match(CONFIG.UUID_REGEX);
    if (!match?.[1]) return jsonify({ list: [{ title: '默认分组', tracks }] });

    const uuid = match[1];
    const m3u8Url = `${CONFIG.M3U8_PREFIX}${uuid}${CONFIG.M3U8_SUFFIX}`;
    const m3u8Data = await fetchWithRetry(m3u8Url);
    if (!m3u8Data) return jsonify({ list: [{ title: '默认分组', tracks }] });

    // 解析m3u8内容优化
    m3u8Data.split('\n')
        .filter(line => line.includes('/video.m3u8'))
        .forEach(line => {
            const name = line.replace('/video.m3u8', '') || '清晰度';
            tracks.unshift({
                name,
                pan: '',
                ext: { url: `${CONFIG.M3U8_PREFIX}${uuid}/${line}` }
            });
        });

    // 添加自动播放选项
    tracks.push({
        name: '自动',
        pan: '',
        ext: { url: m3u8Url }
    });

    return jsonify({ list: [{ title: '默认分组', tracks }] });
}

// 优化：播放信息获取（保持简洁，增加参数校验）
async function getPlayinfo(ext) {
    ext = argsify(ext) || {};
    const { url } = ext;
    if (!url) return jsonify({ urls: [] }); // 空URL防护
    return jsonify({ urls: [url] });
}

// 优化：搜索功能（复用视频解析逻辑）
async function search(ext) {
    ext = argsify(ext) || {};
    const { text, page = CONFIG.DEFAULT_PAGE } = ext;
    if (!text) return jsonify({ list: [] }); // 空关键词防护

    const encodedText = encodeURIComponent(text);
    const url = `${appConfig.site}/cn/search/${encodedText}?page=${page}`;
    const data = await fetchWithRetry(url);
    if (!data) return jsonify({ list: [] });

    const $ = cheerio.load(data);
    const cards = parseVideoList($);
    return jsonify({ list: cards });
}