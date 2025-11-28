const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const cheerio = createCheerio();

/*
{	
    "enload": true
}
*/
let $config = argsify($config_str);

// ======================== 1. 应用配置（基于原JSON转换）========================
const appConfig = {
    ver: 1,
    title: 'motv',
    site: 'https://motv.app',
    tabs: [
        { name: '日本有码', ui: 1, ext: { id: '20-----------' } }, // 对应原分类url0的核心ID
        { name: '日本无码', ui: 1, ext: { id: '50-----------' } },
        { name: '国产', ui: 1, ext: { id: '41-----------' } }
    ],
};

// ======================== 2. 常量配置（简化维护）========================
const CONFIG = {
    SELECTORS: {
        videoItem: 'div.movie-list-body.flex div.movie-list-item', // 分类视频节点
        searchVideoItem: 'div.movie-list-body.flex div.vod-search-list', // 搜索视频节点
        videoTitle: 'div.movie-title', // 视频标题
        videoCover: 'div.movie-post-lazyload', // 封面图（data-original属性）
        videoLink: 'a', // 视频链接（href属性）
        // 原JSON无评分/时长，暂不添加
    },
    URL: {
        category: 'https://motv.app/vodshow/{id}--------{pg}---/', // 分类分页URL模板
        searchFirst: 'https://motv.app/vodsearch/-------------/?wd={wd}', // 搜索第一页
        searchOther: 'https://motv.app/vodsearch/{wd}----------{pg}---/' // 搜索分页
    },
    ERROR_MESSAGES: {
        noData: '暂无数据'
    }
};

// ======================== 3. 工具函数（统一请求处理）========================
async function fetchWithRetry(url) {
    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } });
        // 反爬拦截（如需要）
        if (data.includes('Just a moment...')) {
            $utils.openSafari(url, UA);
            return null;
        }
        return data;
    } catch (err) {
        console.error(`请求失败：${err.message}`);
        return null;
    }
}

// ======================== 4. 女优收藏（原JSON无此功能，保留空实现兼容格式）========================
async function getactress() {
    return []; // motv配置无收藏功能，返回空列表
}

// ======================== 5. 配置获取（兼容enload参数）========================
async function getConfig() {
    let config = { ...appConfig };
    if ($config.enload) {
        const actressList = await getactress();
        config.tabs = config.tabs.concat(actressList);
    }
    return jsonify(config);
}

// ======================== 6. 视频列表解析（通用逻辑）========================
function parseVideoList($, isSearch = false) {
    const cards = [];
    const $nodes = isSearch 
        ? $(CONFIG.SELECTORS.searchVideoItem) 
        : $(CONFIG.SELECTORS.videoItem);

    $nodes.each((_, e) => {
        const $e = $(e);
        const href = $e.find(CONFIG.SELECTORS.videoLink).attr('href') || '';
        const title = $e.find(CONFIG.SELECTORS.videoTitle).text().trim().replace(/\s+/g, ' ') || '';
        const cover = $e.find(CONFIG.SELECTORS.videoCover).attr('data-original') || '';
        // 原JSON无备注/时长，设为空
        const remarks = '';
        const duration = '';

        if (href && title) {
            cards.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: remarks,
                vod_duration: duration,
                ext: { url: `${appConfig.site}${href}` } // 拼接完整详情页URL
            });
        }
    });
    return cards;
}

// ======================== 7. 分类视频抓取（getCards）========================
async function getCards(ext) {
    ext = argsify(ext);
    let cards = [];
    let { page = 1, id } = ext;

    // 构造分页URL（第一页page=1时，URL末尾为"-----------/"，对应原url0）
    const url = CONFIG.URL.category.replace('{id}', id).replace('{pg}', page);
    const data = await fetchWithRetry(url);
    if (!data) return jsonify({ list: [] });

    const $ = cheerio.load(data);
    cards = parseVideoList($);
    return jsonify({ list: cards });
}

// ======================== 8. 播放链接提取（getTracks）========================
async function getTracks(ext) {
    ext = argsify(ext);
    let url = ext.url;
    let tracks = [];

    // 原JSON的play_regex为Base64编码，解码后是："url":"(https?\[.*\]+)"（暂未找到具体播放API，此处适配通用m3u8逻辑）
    const data = await fetchWithRetry(url);
    if (!data) return jsonify({ list: [{ title: '默认分组', tracks }] });

    // 此处需根据motv实际播放链接规则调整，暂用占位逻辑（若有具体play API可替换）
    // 示例：从详情页提取播放UUID，构造m3u8链接
    const match = data.match(/playId="([^"]+)"/); // 假设播放ID在playId属性中
    if (match && match[1]) {
        const playUrl = `https://motv.app/api/play/${match[1]}/playlist.m3u8`;
        tracks.push({
            name: '自动',
            pan: '',
            ext: { url: playUrl }
        });
    }

    return jsonify({
        list: [
            { title: '默认分组', tracks }
        ]
    });
}

// ======================== 9. 播放信息获取（getPlayinfo）========================
async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = ext.url;
    return jsonify({ urls: [url] });
}

// ======================== 10. 搜索功能（search）========================
async function search(ext) {
    ext = argsify(ext);
    let cards = [];
    let text = encodeURIComponent(ext.text);
    let page = ext.page || 1;

    // 构造搜索URL
    const url = page === 1 
        ? CONFIG.URL.searchFirst.replace('{wd}', text) 
        : CONFIG.URL.searchOther.replace('{wd}', text).replace('{pg}', page);

    const data = await fetchWithRetry(url);
    if (!data) return jsonify({ list: [] });

    const $ = cheerio.load(data);
    cards = parseVideoList($, true); // 标记为搜索结果
    return jsonify({ list: cards });
}