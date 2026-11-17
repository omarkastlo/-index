async function applyAppLanguage() {
    const lang = localStorage.getItem('jacki_lang') || 'ar';
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
        const res = await fetch(`/locales/${lang}.json`);
        const dict = await res.json();
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const k = el.getAttribute('data-i18n');
            if (dict[k]) el.innerText = dict[k];
        });
    } catch (e) {}
}
document.addEventListener('DOMContentLoaded', applyAppLanguage);
