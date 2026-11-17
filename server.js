const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'jacki_db.json');

const BANNED_WORDS = ['شتيمة', 'سب', 'كلب', 'حمار', 'قذر', 'احمق', 'لعنة', 'تافه', 'احتيال', 'http://', 'bit.ly', 'tinyurl'];
function aiModerateText(text) {
    if (!text) return { clean: true };
    const lower = text.toLowerCase();
    for (const word of BANNED_WORDS) {
        if (lower.includes(word)) {
            return { clean: false, reason: `تم حظر الرسالة تلقائياً بواسطة نظام الذكاء الاصطناعي لاحتوائها على محتوى مخالف (${word})` };
        }
    }
    return { clean: true };
}

function calcVipLevel(totalSpent) {
    const thresholds = [50, 300, 800, 1500, 2500, 4000, 6000, 9000, 14000, 20000, 30000, 40000, 55000, 75000, 100000];
    let lvl = 0;
    thresholds.forEach((t, i) => { if (totalSpent >= t) lvl = i + 1; });
    return lvl;
}

const defaultDB = {
    users: {
        "1": {
            id: "1", username: "@admin", name: "Jacki Official Developer",
            contactType: "email", contact: "admin", password: "adminkastlo",
            role: "developer", agencyId: "JACKI_HQ", liveUnlocked: true,
            isVerified: true, verificationBadge: "gold", vipLevel: 15,
            totalSpent: 150000, totalEarned: 0, wallet: 50000,
            followers: [], following: [], hideFollowing: false, lockMessages: false, isPrivate: false,
            activeFrame: "gold_dragon", activeBubble: "royal_gold",
            ownedItems: ["gold_dragon", "neon_pulse", "royal_gold", "cyber_bubble"],
            bio: "المطور الرسمي ومؤسس منصة Jacki", warnings: [], banned: false, banReason: null
        }
    },
    videos: [], stories: [],
    notifications: {
        "1": [{ id: 1, title: "مرحباً بك في Jacki 👑", message: "تم تفعيل لوحة المطور الحصرية بنجاح.", type: "system", time: "الآن" }]
    },
    chats: [], withdrawalRequests: [], verificationRequests: [],
    voiceRooms: [
        { id: "room_1", title: "مجلس سمر Jacki الرسمي 🎙️", hostId: "1", hostName: "Jacki Official", seats: Array(8).fill(null) }
    ]
};

let db = defaultDB;
if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { db = defaultDB; }
}
function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8'); }
saveDB();

let liveStreams = {};

function sanitizeUserForPublic(u, viewerId) {
    if (!u) return null;
    const isSelf = u.id === viewerId;
    const viewer = db.users[viewerId];
    const isAdmin = viewer && (viewer.role === 'developer' || viewer.role === 'admin');
    const copy = { ...u };
    delete copy.password;
    if (!isSelf && !isAdmin) { delete copy.contact; delete copy.contactType; delete copy.wallet; }
    if (!isSelf && !isAdmin && u.hideFollowing) {
        copy.followingHidden = true; copy.followingList = []; copy.followingCount = "مخفي";
    } else {
        copy.followingHidden = false;
        copy.followingList = (u.following || []).map(fid => db.users[fid] ? { id: fid, name: db.users[fid].name, username: db.users[fid].username } : null).filter(Boolean);
        copy.followingCount = (u.following || []).length;
    }
    copy.followersCount = (u.followers || []).length;
    return copy;
}

function validateContact(type, value) {
    if (!value || typeof value !== 'string') return false;
    const t = value.trim();
    if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
    if (type === 'phone') return /^\+?[0-9]{10,15}$/.test(t);
    return false;
}

app.post('/api/auth/register', (req, res) => {
    const { name, username, contactType, contact, password } = req.body;
    if (!name || !contactType || !contact || !password) return res.status(400).json({ error: "جميع الحقول مطلوبة." });
    if (!validateContact(contactType, contact)) return res.status(400).json({ error: "رقم الهاتف أو البريد غير صحيح." });
    if (password.length < 6) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف فأكثر." });
    const cleanContact = contact.trim().toLowerCase();
    if (Object.values(db.users).some(u => u.contact.toLowerCase() === cleanContact)) return res.status(409).json({ error: "الحساب مسجل مسبقاً." });

    const newId = String(Math.floor(1000 + Math.random() * 90000));
    let cleanUser = username ? username.trim() : `@jacki_${newId}`;
    if (!cleanUser.startsWith('@')) cleanUser = '@' + cleanUser;

    db.users[newId] = {
        id: newId, username: cleanUser, name: name.trim(), contactType, contact: cleanContact, password,
        role: "user", agencyId: null, liveUnlocked: false, isVerified: false, verificationBadge: null,
        vipLevel: 0, totalSpent: 0, totalEarned: 0, wallet: 0, followers: [], following: [],
        hideFollowing: false, lockMessages: false, isPrivate: false, activeFrame: null, activeBubble: null,
        ownedItems: [], bio: "مستخدم جديد في Jacki", warnings: [], banned: false, banReason: null
    };
    db.notifications[newId] = [{ id: Date.now(), title: "أهلاً بك في Jacki 🎉", message: `تم إنشاء حسابك برقم ID: ${newId}`, type: "system", time: "الآن" }];
    saveDB();
    res.json({ success: true, user: sanitizeUserForPublic(db.users[newId], newId) });
});

app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: "أدخل بيانات الدخول." });
    const cleanId = identifier.trim().toLowerCase();
    const user = Object.values(db.users).find(u =>
        (u.contact.toLowerCase() === cleanId || u.username.toLowerCase() === cleanId || u.username.toLowerCase() === '@' + cleanId || u.id === cleanId) && u.password === password
    );
    if (!user) return res.status(401).json({ error: "بيانات الدخول غير صحيحة." });
    if (user.banned) return res.status(403).json({ error: `الحساب محظور. السبب: ${user.banReason}` });
    res.json({ success: true, user: sanitizeUserForPublic(user, user.id) });
});

app.get('/api/user/:id', (req, res) => {
    const user = db.users[req.params.id];
    if (!user) return res.status(404).json({ error: "غير موجود" });
    res.json(sanitizeUserForPublic(user, req.query.viewerId || req.params.id));
});

app.post('/api/user/:id/update-profile', (req, res) => {
    const user = db.users[req.params.id];
    if (!user) return res.status(404).json({ error: "غير موجود" });
    const { name, username, bio, hideFollowing, lockMessages, isPrivate } = req.body;
    if (name !== undefined && name.trim()) user.name = name.trim();
    if (username !== undefined && username.trim()) user.username = username.trim().startsWith('@') ? username.trim() : '@' + username.trim();
    if (bio !== undefined) user.bio = bio.trim();
    if (hideFollowing !== undefined) user.hideFollowing = Boolean(hideFollowing);
    if (lockMessages !== undefined) user.lockMessages = Boolean(lockMessages);
    if (isPrivate !== undefined) user.isPrivate = Boolean(isPrivate);
    saveDB();
    res.json({ success: true, user: sanitizeUserForPublic(user, user.id) });
});

app.post('/api/user/follow', (req, res) => {
    const { followerId, targetId } = req.body;
    const f = db.users[followerId], t = db.users[targetId];
    if (!f || !t || followerId === targetId) return res.status(400).json({ error: "خطأ" });
    const idx = f.following.indexOf(targetId);
    if (idx === -1) {
        f.following.push(targetId);
        if (!t.followers.includes(followerId)) t.followers.push(followerId);
        if (!db.notifications[targetId]) db.notifications[targetId] = [];
        db.notifications[targetId].unshift({ id: Date.now(), title: "متابع جديد 👤", message: `بدأ ${f.name} بمتابعتك.`, type: "follow", time: "الآن" });
    } else {
        f.following.splice(idx, 1);
        t.followers = t.followers.filter(id => id !== followerId);
    }
    saveDB();
    res.json({ success: true, isFollowing: idx === -1, followersCount: t.followers.length });
});

app.get('/api/stories', (req, res) => {
    db.stories = db.stories.filter(s => s.expiresAt > Date.now());
    saveDB();
    res.json(db.stories.map(s => ({ ...s, userName: (db.users[s.userId] || {}).name || 'مستخدم' })));
});

app.post('/api/stories', (req, res) => {
    const { userId, mediaType, mediaContent, caption } = req.body;
    if (!db.users[userId] || !mediaContent) return res.status(400).json({ error: "بيانات ناقصة" });
    const mod = aiModerateText(caption);
    if (!mod.clean) return res.status(400).json({ error: mod.reason });
    const story = { id: Date.now(), userId, mediaType: mediaType || 'text', mediaContent, caption: caption || '', expiresAt: Date.now() + 86400000 };
    db.stories.unshift(story);
    saveDB();
    res.json({ success: true, story });
});

app.get('/api/videos', (req, res) => {
    const mode = req.query.mode || 'foryou';
    const me = db.users[req.query.userId || ''];
    let list = db.videos;
    if (mode === 'following' && me) list = list.filter(v => me.following.includes(v.userId));
    res.json(list.map(v => {
        const a = db.users[v.userId] || {};
        return { ...v, authorName: a.name || 'مستخدم', username: a.username || '@user', isVerified: a.isVerified, verificationBadge: a.verificationBadge, vipLevel: a.vipLevel || 0 };
    }));
});

app.post('/api/videos', (req, res) => {
    const { userId, videoUrl, caption } = req.body;
    const user = db.users[userId];
    if (!user || !videoUrl) return res.status(400).json({ error: "رابط الفيديو مطلوب" });
    const mod = aiModerateText(caption);
    if (!mod.clean) return res.status(400).json({ error: mod.reason });
    const vid = { id: Date.now(), userId, videoUrl: videoUrl.trim(), caption: (caption || '').trim(), likes: [], comments: [], createdAt: new Date().toLocaleDateString() };
    db.videos.unshift(vid);
    (user.followers || []).forEach(fid => {
        if (!db.notifications[fid]) db.notifications[fid] = [];
        db.notifications[fid].unshift({ id: Date.now() + Math.random(), title: "فيديو جديد 🎬", message: `نشر ${user.name} فيديو جديد`, type: "video", time: "الآن" });
    });
    saveDB();
    res.json({ success: true, video: vid });
});

app.post('/api/videos/:id/like', (req, res) => {
    const vid = db.videos.find(v => String(v.id) === req.params.id);
    if (!vid) return res.status(404).json({ error: "غير موجود" });
    const idx = vid.likes.indexOf(req.body.userId);
    if (idx === -1) vid.likes.push(req.body.userId); else vid.likes.splice(idx, 1);
    saveDB();
    res.json({ success: true });
});

app.post('/api/videos/:id/comment', (req, res) => {
    const { userId, text, parentId } = req.body;
    const user = db.users[userId], vid = db.videos.find(v => String(v.id) === req.params.id);
    if (!user || !vid || !text) return res.status(400).json({ error: "خطأ" });
    const mod = aiModerateText(text);
    if (!mod.clean) return res.status(400).json({ error: mod.reason });
    const c = { id: Date.now(), userId, userName: user.name, username: user.username, text: text.trim(), likes: [], replies: [], time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    if (parentId) {
        const p = vid.comments.find(x => String(x.id) === String(parentId));
        if (p) p.replies.push(c); else vid.comments.push(c);
    } else vid.comments.push(c);
    saveDB();
    res.json({ success: true, comments: vid.comments });
});

app.post('/api/videos/:vidId/comment/:commentId/like', (req, res) => {
    const vid = db.videos.find(v => String(v.id) === req.params.vidId);
    const c = vid && vid.comments.find(x => String(x.id) === req.params.commentId);
    if (c) {
        const idx = c.likes.indexOf(req.body.userId);
        if (idx === -1) c.likes.push(req.body.userId); else c.likes.splice(idx, 1);
        saveDB();
    }
    res.json({ success: true, comments: vid ? vid.comments : [] });
});

app.post('/api/wallet/topup', (req, res) => {
    const u = db.users[req.body.userId];
    const amt = Number(req.body.amount);
    if (!u || amt <= 0) return res.status(400).json({ error: "خطأ" });
    u.wallet += amt; saveDB();
    res.json({ success: true, wallet: u.wallet });
});

app.post('/api/wallet/withdraw', (req, res) => {
    const { userId, amount, method, accountNumber } = req.body;
    const u = db.users[userId];
    const amt = Number(amount);
    if (!u || amt < 50 || u.wallet < amt) return res.status(400).json({ error: "الحد الأدنى للسحب 50 ج.م والرصيد غير كافٍ." });
    u.wallet -= amt;
    db.withdrawalRequests.unshift({ id: Date.now(), userId, userName: u.name, amount: amt, method, accountNumber, status: 'pending', time: new Date().toLocaleString() });
    saveDB();
    res.json({ success: true, message: "تم إرسال طلب السحب للإدارة." });
});

app.get('/api/wallet/requests/:userId', (req, res) => {
    const u = db.users[req.params.userId];
    if (!u) return res.status(404).json([]);
    res.json((u.role === 'developer' || u.role === 'admin') ? db.withdrawalRequests : db.withdrawalRequests.filter(r => r.userId === req.params.userId));
});

const STORE_ITEMS = [
    { id: "gold_dragon", name: "إطار التنين الذهبي 🐉", type: "frame", price: 300 },
    { id: "neon_pulse", name: "إطار النيون الملكي ⚡", type: "frame", price: 150 },
    { id: "diamond_crown", name: "إطار التاج الماسي 💎", type: "frame", price: 600 },
    { id: "royal_gold", name: "فقاعة دردشة ذهبية ✨", type: "bubble", price: 200 },
    { id: "cyber_bubble", name: "فقاعة دردشة نيون 🔥", type: "bubble", price: 120 }
];
app.get('/api/store/items', (req, res) => res.json(STORE_ITEMS));
app.post('/api/store/buy', (req, res) => {
    const u = db.users[req.body.userId], item = STORE_ITEMS.find(i => i.id === req.body.itemId);
    if (!u || !item) return res.status(404).json({ error: "غير موجود" });
    if (!u.ownedItems.includes(item.id)) {
        if (u.wallet < item.price) return res.status(400).json({ error: "رصيد المحفظة غير كافٍ" });
        u.wallet -= item.price; u.totalSpent += item.price; u.vipLevel = calcVipLevel(u.totalSpent);
        u.ownedItems.push(item.id);
    }
    if (item.type === 'frame') u.activeFrame = item.id;
    if (item.type === 'bubble') u.activeBubble = item.id;
    saveDB();
    res.json({ success: true, message: `تم تفعيل ${item.name}` });
});

app.get('/api/leaderboard', (req, res) => {
    const all = Object.values(db.users).filter(u => !u.banned);
    res.json({
        topGivers: [...all].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10).map(u => sanitizeUserForPublic(u, '')),
        topStreamers: [...all].sort((a, b) => b.totalEarned - a.totalEarned).slice(0, 10).map(u => sanitizeUserForPublic(u, ''))
    });
});

app.post('/api/verification/request', (req, res) => {
    const u = db.users[req.body.userId];
    if (!u) return res.status(404).json({ error: "غير موجود" });
    db.verificationRequests.unshift({ id: Date.now(), userId: u.id, userName: u.name, badgeType: req.body.badgeType || 'blue', reason: req.body.reason, status: 'pending' });
    saveDB();
    res.json({ success: true, message: "تم إرسال طلب التوثيق للمطور." });
});

app.get('/api/admin/overview', (req, res) => {
    const adm = db.users[req.query.adminId];
    if (!adm || (adm.role !== 'developer' && adm.role !== 'admin' && adm.role !== 'support')) return res.status(403).json({ error: "مرفوض" });
    res.json({ users: Object.values(db.users).map(u => sanitizeUserForPublic(u, adm.id)), withdrawalRequests: db.withdrawalRequests, verificationRequests: db.verificationRequests });
});

app.post('/api/admin/action', (req, res) => {
    const { adminId, targetUserId, action, reason, agencyId, role, badgeType, requestId } = req.body;
    const adm = db.users[adminId];
    if (!adm || (adm.role !== 'developer' && adm.role !== 'admin' && adm.role !== 'support')) return res.status(403).json({ error: "مرفوض" });

    if (action === 'approve_withdraw' || action === 'reject_withdraw') {
        const w = db.withdrawalRequests.find(r => String(r.id) === String(requestId));
        if (w) {
            w.status = action === 'approve_withdraw' ? 'approved' : 'rejected';
            if (action === 'reject_withdraw' && db.users[w.userId]) db.users[w.userId].wallet += w.amount;
            saveDB();
            return res.json({ success: true, message: "تم تحديث الطلب" });
        }
    }
    const target = db.users[targetUserId];
    if (!target) return res.status(404).json({ error: "المستخدم غير موجود" });

    if (action === 'unlock_agency_live') {
        if (!agencyId) return res.status(400).json({ error: "أدخل ID الوكالة" });
        target.agencyId = agencyId.trim(); target.liveUnlocked = true;
        if (!db.notifications[target.id]) db.notifications[target.id] = [];
        db.notifications[target.id].unshift({ id: Date.now(), title: "تفعيل البث والوكالة 🎥", message: `تم ربطك بالوكالة (${target.agencyId}) وفتح البث المباشر.`, type: "agency", time: "الآن" });
        saveDB();
        return res.json({ success: true, message: `تم ربط ${target.name} بالوكالة (${target.agencyId}) وفتح البث.` });
    }
    if (action === 'warn') {
        target.warnings.push({ reason, by: adm.name, time: new Date().toLocaleString() });
        if (!db.notifications[target.id]) db.notifications[target.id] = [];
        db.notifications[target.id].unshift({ id: Date.now(), title: "⚠️ إنذار رسمي من الإدارة", message: `السبب: ${reason}`, type: "warning", time: "الآن" });
        saveDB();
        return res.json({ success: true, message: "تم إرسال الإنذار" });
    }
    if (action === 'ban') { target.banned = true; target.banReason = reason; saveDB(); return res.json({ success: true, message: "تم حظر الحساب" }); }
    if (action === 'unban') { target.banned = false; target.banReason = null; saveDB(); return res.json({ success: true, message: "تم فك الحظر" }); }
    if (action === 'delete') { if (target.role !== 'developer') delete db.users[targetUserId]; saveDB(); return res.json({ success: true, message: "تم حذف الحساب" }); }
    if (action === 'assign_role') { if (adm.role !== 'developer') return res.status(403).json({ error: "للمطور فقط" }); target.role = role; saveDB(); return res.json({ success: true, message: "تم تحديث الصلاحية" }); }
    if (action === 'verify_direct') { target.isVerified = true; target.verificationBadge = badgeType || 'gold'; saveDB(); return res.json({ success: true, message: "تم التوثيق" }); }
    res.status(400).json({ error: "خطأ" });
});

app.get('/api/notifications/:userId', (req, res) => res.json(db.notifications[req.params.userId] || []));
app.get('/api/chats/conversations/:userId', (req, res) => {
    const uid = req.params.userId;
    const peers = new Set(uid !== "1" ? ["1"] : []);
    db.chats.forEach(c => { if (c.senderId === uid) peers.add(c.receiverId); if (c.receiverId === uid) peers.add(c.senderId); });
    res.json(Array.from(peers).map(pid => db.users[pid] ? { peerId: pid, name: db.users[pid].name, username: db.users[pid].username, isVerified: db.users[pid].isVerified, verificationBadge: db.users[pid].verificationBadge, lastMessage: 'اضغط لفتح المحادثة', time: '' } : null).filter(Boolean));
});
app.get('/api/chat/:u1/:u2', (req, res) => res.json(db.chats.filter(c => (c.senderId === req.params.u1 && c.receiverId === req.params.u2) || (c.senderId === req.params.u2 && c.receiverId === req.params.u1))));
app.post('/api/chat/send', (req, res) => {
    const { senderId, receiverId, msgType, content } = req.body;
    const s = db.users[senderId], r = db.users[receiverId];
    if (!s || !r || !content) return res.status(400).json({ error: "خطأ" });
    if (r.lockMessages && s.role !== 'developer' && s.role !== 'admin') return res.status(403).json({ error: "الرسائل مقفلة لدى هذا المستخدم" });
    if ((msgType || 'text') === 'text') { const m = aiModerateText(content); if (!m.clean) return res.status(400).json({ error: m.reason }); }
    const msg = { id: Date.now(), senderId, senderBubble: s.activeBubble, receiverId, msgType: msgType || 'text', content, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    db.chats.push(msg); saveDB();
    io.to(`user_${receiverId}`).emit('new_private_msg', msg);
    io.to(`user_${senderId}`).emit('new_private_msg', msg);
    res.json({ success: true, msg });
});

app.get('/api/live/active', (req, res) => res.json(Object.values(liveStreams)));
app.get('/api/voice/rooms', (req, res) => res.json(db.voiceRooms));
app.post('/api/voice/rooms', (req, res) => {
    const h = db.users[req.body.hostId];
    if (!h || !req.body.title) return res.status(400).json({ error: "خطأ" });
    const room = { id: `room_${Date.now()}`, title: req.body.title, hostId: h.id, hostName: h.name, seats: Array(8).fill(null) };
    db.voiceRooms.unshift(room); saveDB();
    res.json({ success: true, room });
});

io.on('connection', (socket) => {
    socket.on('register_socket_user', uid => socket.join(`user_${uid}`));
    socket.on('start_live_room', ({ hostId }) => {
        const h = db.users[hostId];
        if (!h || (!h.liveUnlocked && (h.followers || []).length < 1000 && h.role !== 'developer' && h.role !== 'admin')) {
            socket.emit('live_error', "يتطلب البث المباشر 1,000 متابع (1K) أو الانضمام إلى وكالة معتمدة via الإدارة.");
            return;
        }
        const streamId = `live_${hostId}`;
        liveStreams[streamId] = { streamId, hostId, hostName: h.name, hostVip: h.vipLevel, viewers: 1, totalEarned: 0, muted: [], banned: [], mods: [], pk: null, treasure: null };
        socket.join(streamId);
        socket.emit('live_started', liveStreams[streamId]);
        io.emit('active_lives_updated', Object.values(liveStreams));
    });
    socket.on('join_live', ({ streamId, userId }) => {
        const s = liveStreams[streamId], u = db.users[userId];
        if (!s || !u) return;
        if (s.banned.includes(userId)) { socket.emit('user_kicked', userId); return; }
        socket.join(streamId); s.viewers++;
        io.to(streamId).emit('stream_state', s);
        if (u.vipLevel >= 1) {
            io.to(streamId).emit('vip_entrance', { bannerText: `دخل ${u.name} [VIP ${u.vipLevel}] مع سيارة فيراري وتأثيرات ذهبية 🏎️🎆` });
        }
    });
    socket.on('live_chat', ({ streamId, userId, msg }) => {
        const s = liveStreams[streamId], u = db.users[userId];
        if (!s || !u || !msg || s.muted.includes(userId)) return;
        const mod = aiModerateText(msg);
        if (!mod.clean) { socket.emit('chat_error', mod.reason); return; }
        io.to(streamId).emit('new_chat', { userId: u.id, userName: u.name, vipLevel: u.vipLevel, isMod: s.mods.includes(u.id), isHost: s.hostId === u.id, msg });
    });
    socket.on('host_action', ({ streamId, actorId, targetUserId, action }) => {
        const s = liveStreams[streamId];
        if (!s || (s.hostId !== actorId && !s.mods.includes(actorId))) return;
        if (action === 'mute') { s.muted.push(targetUserId); io.to(streamId).emit('system_live_notice', `🔇 تم كتم (ID: ${targetUserId})`); }
        if (action === 'kick') { s.banned.push(targetUserId); io.to(streamId).emit('user_kicked', targetUserId); }
        if (action === 'mod' && s.hostId === actorId) { s.mods.push(targetUserId); io.to(streamId).emit('system_live_notice', `🛡️ تمت ترقية (ID: ${targetUserId}) مشرفاً`); }
    });
    socket.on('send_gift', ({ streamId, senderId, giftName, giftValue, pkSide }) => {
        const s = liveStreams[streamId], sender = db.users[senderId];
        if (!s || !sender) return;
        if (sender.wallet < giftValue) { socket.emit('gift_error', "رصيد محفظتك غير كافٍ!"); return; }
        sender.wallet -= giftValue; sender.totalSpent += giftValue; sender.vipLevel = calcVipLevel(sender.totalSpent);
        s.totalEarned += giftValue;
        if (db.users[s.hostId]) { db.users[s.hostId].wallet += giftValue; db.users[s.hostId].totalEarned += giftValue; }
        if (s.pk && s.pk.active) { if (pkSide === 'right') s.pk.rightScore += giftValue; else s.pk.leftScore += giftValue; }
        saveDB();
        io.to(streamId).emit('gift_received', { senderName: sender.name, giftName, giftValue, newEarned: s.totalEarned, pk: s.pk });
    });
    socket.on('start_pk', ({ streamId, opponentName }) => {
        const s = liveStreams[streamId]; if (!s) return;
        s.pk = { active: true, leftName: s.hostName, rightName: opponentName || "المنافس ⚔️", leftScore: 0, rightScore: 0 };
        io.to(streamId).emit('pk_updated', s.pk);
    });
    socket.on('drop_treasure', ({ streamId, senderId, coins, condition }) => {
        const s = liveStreams[streamId], sender = db.users[senderId], amt = Number(coins);
        if (!s || !sender || amt < 10 || sender.wallet < amt) { socket.emit('gift_error', "رصيد غير كافٍ (الحد الأدنى 10)"); return; }
        sender.wallet -= amt; saveDB();
        s.treasure = { ownerName: sender.name, coins: amt, condition: condition || "متابعة المضيف", participants: [] };
        io.to(streamId).emit('treasure_dropped', s.treasure);
    });
    socket.on('claim_treasure', ({ streamId, userId }) => {
        const s = liveStreams[streamId], u = db.users[userId];
        if (!s || !s.treasure || !u || s.treasure.participants.includes(userId)) return;
        const prize = Math.min(s.treasure.coins, Math.max(2, Math.floor(s.treasure.coins / 3)));
        s.treasure.coins -= prize; s.treasure.participants.push(userId); u.wallet += prize; saveDB();
        io.to(streamId).emit('system_live_notice', `🎁 فاز ${u.name} بمبلغ ${prize} ج.م من صندوق الكنز!`);
        if (s.treasure.coins <= 0) { s.treasure = null; io.to(streamId).emit('treasure_ended'); }
    });
    socket.on('end_live', ({ streamId }) => {
        const s = liveStreams[streamId]; if (!s) return;
        io.to(streamId).emit('live_ended_summary', { totalEarned: s.totalEarned });
        delete liveStreams[streamId];
        io.emit('active_lives_updated', Object.values(liveStreams));
    });
    socket.on('join_voice_room', ({ roomId }) => {
        socket.join(roomId);
        const r = db.voiceRooms.find(x => x.id === roomId);
        if (r) io.to(roomId).emit('voice_room_state', r);
    });
    socket.on('take_voice_seat', ({ roomId, seatIndex, userId }) => {
        const r = db.voiceRooms.find(x => x.id === roomId), u = db.users[userId];
        if (!r || !u) return;
        r.seats = r.seats.map(s => (s && s.id === userId) ? null : s);
        if (!r.seats[seatIndex]) r.seats[seatIndex] = { id: u.id, name: u.name };
        saveDB(); io.to(roomId).emit('voice_room_state', r);
    });
    socket.on('leave_voice_seat', ({ roomId, userId }) => {
        const r = db.voiceRooms.find(x => x.id === roomId);
        if (r) { r.seats = r.seats.map(s => (s && s.id === userId) ? null : s); saveDB(); io.to(roomId).emit('voice_room_state', r); }
    });
    socket.on('voice_chat_msg', ({ roomId, userId, msg }) => {
        const u = db.users[userId];
        if (u && msg) io.to(roomId).emit('new_voice_msg', { userName: u.name, msg });
    });
});

server.listen(3000, () => console.log("Jacki Platform v4.0 running on http://localhost:3000/auth.html"));
