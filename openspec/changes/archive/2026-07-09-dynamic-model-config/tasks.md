## 1. 鎶藉嚭鍙鐢ㄧ殑 traecli 瀹氫綅閫昏緫

- [x] 1.1 鍦?`scripts/lib/config.mjs` 鏂板骞跺鍑?`resolveTraecli()`锛坋nv `TRAECLI_PATH` 鈫?浼犲叆鐨?`traecliPath` 鈫?骞冲彴鍊欓€夎矾寰?鈫?PATH 鍥為€€锛夛紝閫昏緫瀵归綈 `src/server.js`
- [x] 1.2 淇濊瘉 `resolveTraecli()` 鍙帴鍙?`traecliPath` 鍙傛暟锛屼究浜?`config/config.mjs` 浼犲叆甯搁噺

## 2. 鏂板閰嶇疆婧?config/config.mjs

- [x] 2.1 鍒涘缓 `config/config.mjs`锛屽鍑哄父閲?`port`銆乣host`銆乣traecliPath`銆乣defaultPermissionMode`銆乣maxPromptChars`
- [x] 2.2 瀹炵幇 `resolveModels()`锛歴pawn `traecli models`锛屾敹闆?stdout锛屾寜琛?trim/杩囨护绌鸿寰楀埌 ID 鍒楄〃锛屾槧灏勪负 `{ id, name: "<id> (Trae)" }`
- [x] 2.3 `resolveModels()` 鍦?spawn 澶辫触銆侀€€鍑虹爜闈為浂鎴栧垪琛ㄤ负绌烘椂鎶涘嚭娓呮櫚閿欒
- [x] 2.4 瀹炵幇 `async resolveConfig()`锛氭眹鎬诲父閲?+ `await resolveModels()`锛岃繑鍥炰笌鏃?`readTraeConfig()` 鐩稿悓褰㈢姸鐨勯厤缃璞?
## 3. 鏀归€犲畨瑁呰剼鏈?
- [x] 3.1 `scripts/lib/config.mjs` 绉婚櫎 `readTraeConfig()`锛堝強鍏跺 `config/trae.json` 鐨勮鍙栦笌鏍￠獙锛?- [x] 3.2 `scripts/install.mjs` 鏀逛负 `import { resolveConfig }` 骞?`const traeCfg = await resolveConfig()`
- [x] 3.3 `install.mjs` 鎹曡幏 `resolveConfig()` 鎶涢敊锛屾墦鍗版竻鏅颁腑鏂囬敊璇苟 `exit(1)`锛屼腑姝㈠墠涓嶅啓鍏ヤ换浣曢厤缃垨閮ㄧ讲鏂囦欢
- [x] 3.4 纭 `deriveProvider` / `deriveBridgeConfig` 鏃犻渶鏀瑰姩鍗冲彲娑堣垂鏂伴厤缃璞?
## 4. 娓呯悊涓庢枃妗?
- [x] 4.1 鍒犻櫎 `config/trae.json`
- [x] 4.2 鏇存柊 `README.md`锛氶厤缃簮鏀逛负 `config/config.mjs`锛岃鏄庢ā鍨嬪垪琛ㄥ畨瑁呮椂瀹炴椂鎷夊彇銆佸け璐ュ嵆涓锛屽強 traecli 鐧诲綍鍓嶇疆鏉′欢
- [x] 4.3 纭 `status.mjs` / `uninstall.mjs` / `src/server.js` 鏃犻渶鏀瑰姩锛堣閮ㄧ讲浜х墿锛屼笉璇绘簮閰嶇疆锛?
## 5. 楠岃瘉

- [x] 5.1 杩愯 `node scripts/install.mjs`锛岀‘璁ら儴缃茬殑 `config.json` 涓?opencode `provider.trae.models` 鍙嶆槧 `traecli models` 瀹炴椂杈撳嚭
- [x] 5.2 妯℃嫙 traecli 涓嶅彲鐢紙涓存椂鏀圭幆澧冿級楠岃瘉瀹夎涓骞剁粰鍑烘竻鏅伴敊璇?- [x] 5.3 閲嶅惎 opencode锛宍/models` 涓嚭鐜?trae 妯″瀷锛堢敤鎴锋墜鍔ㄩ獙璇侊級
