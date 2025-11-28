const cheerio = createCheerio();

// 设置User Agent，模拟浏览器
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

// 应用配置（基于91pron.men JSON转换）
let appConfig = {
    ver: 1,
    title: '91pron',
    site: 'https://91pron.men',
    tabs: [
        { name: '成人自拍', ui: 1, ext: { url: 'https://91pron.men/vodtype/6.html' } },
        { name: '91视频', ui: 1, ext: { url: 'https://91pron.men/vodtype/8.html' } },
        { name: '伦理', ui: 1, ext: { url: 'https://91pron.men/vodtype/9.html' } },
        { name: '无码', ui: 1, ext: { url: 'https://91pron.men/vodtype/23.html' } },
        { name: '中文字幕', ui: 1, ext: { url: 'https://91pron.men/vodtype/21.html' } },
        { name: 'fc2', ui: 1, ext: { url: 'https://91pron.men/vodtype/22.html' } },
        { name: '麻豆传媒', ui: 1, ext: { url: 'https://91pron.men/vodtype/13.html' } },
        { name: '糖心', ui: 1, ext: { url: 'https://91pron.men/vodtype/14.html' } }
    ],
};

// 获取配置（返回分类列表供APP展示）
async function getConfig() {
    let config = appConfig;
    return jsonify(config);
}

// 抓取分类视频列表
async function getCards(ext) {
    ext = argsify(ext);
    let cards = [];
    let { page = 1, url } = ext;

    // 构造分页URL（适配原JSON的分页规则：第2页为 6-2.html 格式）
    if (page > 1) {
        url = url.replace('.html', `-${page}.html`);
    }

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA },
    });

    const $ = cheerio.load(data);

    // 解析视频列表（对应原JSON的XPath规则）
    $('.thumbnail.group').each((_, element) => {
        const $element = $(element);
        // 提取视频标题和链接
        const $titleEl = $element.find('div.my-2.text-sm.text-nord4.truncate a');
        const href = $titleEl.attr('href') || '';
        const title = $titleEl.text().trim() || '';
        // 提取封面图
        const cover = $element.find('img').attr('src') || '';
        // 原JSON无备注信息，设为空
        const vod_remarks = '';

        if (href && title) {
            cards.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: vod_remarks,
                ext: { url: appConfig.site + href }, // 拼接完整详情页URL
            });
        }
    });

    return jsonify({ list: cards });
}

// 提取播放链接（解析详情页，适配原JSON的play_regex）
async function getTracks(ext) {
    ext = argsify(ext);
    let tracks = [];
    const url = ext.url;

    // 从详情页URL提取视频ID（适配 91pron.men/vod/xxx.html 格式）
    const match = url.match(/https?:\/\/91pron\.men\/vod\/(\w+)\.html/);
    if (!match || !match[1]) return jsonify({ list: [{ title: '默认分组', tracks }] });

    const videoId = match[1];
    // 构造播放接口（原JSON play_regex解码为"url":"(https?\[.*\]+)"，暂基于常见格式构造）
    const playUrl = `https://91pron.men/api/play/${videoId}`;

    tracks.push({
        name: '播放',
        pan: '',
        ext: { url: playUrl },
    });

    return jsonify({
        list: [{ title: '默认分组', tracks }],
    });
}

// 获取真实播放地址
async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = ext.url;
    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA },
    });
    const result = argsify(data);

    // 提取播放链接（需根据实际API响应调整，此处适配常见JSON格式）
    const playurl = result.playUrl || result.videoUrl || '';

    return jsonify({ urls: [playurl], headers: [{ 'User-Agent': UA }] });
}

// 搜索功能
async function search(ext) {
    ext = argsify(ext);
    let cards = [];
    let text = encodeURIComponent(ext.text);
    let page = ext.page || 1;

    // 构造搜索分页URL（适配原JSON规则）
    let url;
    if (page === 1) {
        url = `${appConfig.site}/search.html?wd=${text}`;
    } else {
        url = `${appConfig.site}/search${text}/page/${page}.html`;
    }

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA },
    });

    const $ = cheerio.load(data);

    // 解析搜索结果（对应原JSON的search_vod_node规则）
    $('div.my-2.text-sm.text-nord4.truncate').each((_, element) => {
        const $element = $(element);
        const $titleEl = $element.find('a');
        const href = $titleEl.attr('href') || '';
        const title = $titleEl.text().trim() || '';
        // 提取封面图（搜索结果封面选择器与分类一致）
        const cover = $element.closest('.thumbnail.group').find('img').attr('src') || '';
        const vod_remarks = '';

        if (href && title) {
            cards.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: vod_remarks,
                ext: { url: appConfig.site + href },
            });
        }
    });

    return jsonify({ list: cards });
}