已經驗證完成，架構說明如下：

https://test-origin.miap.live
此為模擬*.acer.com，會回傳headers "x-frame-options=sameorigin"，使用CloudFront+Lambda@Edge進行headers添加
此時訪問時，回應headers中，應有x-frame-options

https://test-proxy.miap.live
此為代理中繼，源頭(origin)來自test-origin，使用CloudFront+Lambda@Edge去除headers中的"x-frame-options=sameorigin"，因為CloudFront會bypass源頭網站的所有headers
此時訪問時，回應headers中，已無x-frame-options

https://test-pwa.miap.live
此為PWA網站，上方iframe嵌入test-proxy.miap.live，可成功嵌入，下方iframetest-origin.miap.live則無法嵌入

結論：
1. 即使headers中有x-frame-options，也不影響CloudFront抓取網站內容(origin)
2. CloudFront的Origin會bypass所有headers
3. Lambda@Edge確實可以去除headers中的x-frame-options
4. Iframe只要來源網站中的headers沒有x-frame-options，就可以成功嵌入