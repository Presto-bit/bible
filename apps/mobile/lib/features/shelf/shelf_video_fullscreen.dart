/// 教案视频全屏播放（对齐 PWA ShelfVideoFullscreen）。
library;

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

Future<void> showShelfVideoFullscreen(
  BuildContext context, {
  required String url,
  required String title,
  Map<String, String> headers = const {},
}) {
  return Navigator.of(context).push<void>(
    MaterialPageRoute<void>(
      fullscreenDialog: true,
      builder: (_) => _ShelfVideoFullscreenPage(
        url: url,
        title: title,
        headers: headers,
      ),
    ),
  );
}

class _ShelfVideoFullscreenPage extends StatefulWidget {
  const _ShelfVideoFullscreenPage({
    required this.url,
    required this.title,
    required this.headers,
  });

  final String url;
  final String title;
  final Map<String, String> headers;

  @override
  State<_ShelfVideoFullscreenPage> createState() => _ShelfVideoFullscreenPageState();
}

class _ShelfVideoFullscreenPageState extends State<_ShelfVideoFullscreenPage> {
  late final WebViewController _controller;
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(
        NavigationDelegate(onPageFinished: (_) {
          if (mounted) setState(() => _loading = false);
        }),
      )
      ..loadRequest(Uri.parse(widget.url), headers: widget.headers);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(widget.title, style: const TextStyle(fontSize: 15)),
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          WebViewWidget(controller: _controller),
          if (_loading)
            const Center(child: CircularProgressIndicator(color: Colors.white54)),
        ],
      ),
    );
  }
}
