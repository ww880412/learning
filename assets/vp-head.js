(function(){var k='theme',s=localStorage.getItem(k);if(s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark');
window.__tt=function(){var d=document.documentElement.classList.toggle('dark');localStorage.setItem(k,d?'dark':'light')}})();
