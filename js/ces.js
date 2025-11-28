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

// 提取播放链接（关键优化：从详情页源码解析真实播放接口）
async function getTracks(ext) {
    ext = argsify(ext);
    let tracks = [];
    const detailUrl = ext.url; // 视频详情页URL（如：https://91pron.men/vod/xxx.html）

    // 1. 先请求视频详情页，获取页面源码
    const { data: detailData } = await $fetch.get(detailUrl, {
        headers: { 'User-Agent': UA },
    });
    const $detail = cheerio.load(detailData);

    // 2. 从详情页提取播放接口（核心：适配91pron.men的真实播放链接规则）
    let playApiUrl = '';
    // 方式1：查找页面中隐藏的播放API（常见于script标签或data属性）
    const playScript = $detail('script:contains("playUrl")').html();
    if (playScript) {
        // 匹配类似：playUrl = "https://xxx.com/api/xxx"
        const apiMatch = playScript.match(/playUrl\s*=\s*"([^"]+)"/);
        if (apiMatch && apiMatch[1]) {
            playApiUrl = apiMatch[1];
        }
    }

    // 方式2：若方式1失败，查找视频播放器的iframe src（备选方案）
    if (!playApiUrl) {
        const iframeSrc = $detail('iframe[src*="play"]').attr('src');
        playApiUrl = iframeSrc ? (iframeSrc.startsWith('http') ? iframeSrc : appConfig.site + iframeSrc) : '';
    }

    // 3. 若成功提取到播放接口，添加到播放列表
    if (playApiUrl) {
        tracks.push({
            name: '播放',
            pan: '',
            ext: { url: playApiUrl },
        });
    }

    return jsonify({
        list: [{ title: '默认分组', tracks }],
    });
}

// 获取真实播放地址（关键优化：解析播放接口的响应）
async function getPlayinfo(ext) {
    ext = argsify(ext);
    const playApiUrl = ext.url; // 从getTracks获取的播放接口URL

    try {
        const { data } = await $fetch.get(playApiUrl, {
            headers: { 'User-Agent': UA },
        });
        const result = typeof data === 'string' ? JSON.parse(data) : data;

        // 4. 提取真实播放链接（适配91pron.men常见的响应格式）
        let playurl = '';
        // 常见格式1：{ "url": "https://xxx.m3u8" }
        if (result.url) playurl = result.url;
        // 常见格式2：{ "video": { "src": "https://xxx.m3u8" } }
        else if (result.video && result.video.src) playurl = result.video.src;
        // 常见格式3：直接返回m3u8字符串
        else if (typeof result === 'string' && result.includes('.m3u8')) playurl = result;

        // 5. 若播放链接是相对路径，拼接完整URL
        if (playurl && !playurl.startsWith('http')) {
            playurl = appConfig.site + playurl;
        }

        return jsonify({ urls: [playurl], headers: [{ 'User-Agent': UA }] });
    } catch (err) {
        console.error('获取播放地址失败：', err.message);
        return jsonify({ urls: [] });
    }
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