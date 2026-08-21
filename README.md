# zuku-engine-next2d

Next2D ê¸°ë°˜ zuku Jump ì‹¤í–‰ ë° íŒ¨í‚¤ì§€ ê³„ì•½ì˜ ê³µê°œ ê³¨ê²©ìž…ë‹ˆë‹¤.

ì˜¨ë¼ì¸ íŒ¨í‚¤ì§€ëŠ” WASM/HTML5 ZIPì„ ì‚¬ìš©í•˜ë©° PC ê¸°ë³¸ í•œë„ëŠ” 500MB, ëª¨ë°”ì¼ì€ ì¸ì¦ëœ
ê²½ìš° 100MBìž…ë‹ˆë‹¤. ì‹¤í–‰ ê²½ê³„ëŠ” unprivileged ìƒŒë“œë°•ìŠ¤ ê³„ì•½ì„ ë”°ë¥´ë©°, ì‚¬ìœ  syscall
í•„í„°ì™€ ë©”ëª¨ë¦¬ ê³„ì¸¡ ë‚´ë¶€ëŠ” ì´ ê³µê°œ ë ˆí¬ì— í¬í•¨í•˜ì§€ ì•ŠìŠµë‹ˆë‹¤.

manifest ì˜ˆì‹œëŠ” [`schemas/jump-manifest.schema.json`](schemas/jump-manifest.schema.json)ì„
í™•ì¸í•˜ì„¸ìš”.

## Contract file

schemas/jump-manifest.schema.json fixes the canonical ID, semver, index.html entry point, and platform support.
