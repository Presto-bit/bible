/// 按需挂载 Tab：首次访问才 build；指定 index 访问后永久保活。
library;

import 'package:flutter/widgets.dart';

class LazyIndexedStack extends StatefulWidget {
  const LazyIndexedStack({
    super.key,
    required this.index,
    required this.itemCount,
    required this.itemBuilder,
    this.keepAliveOnceVisited = const {},
  });

  final int index;
  final int itemCount;
  final Widget Function(int index) itemBuilder;

  /// 例如发现 Tab WebView：一旦打开就不再卸载。
  final Set<int> keepAliveOnceVisited;

  @override
  State<LazyIndexedStack> createState() => _LazyIndexedStackState();
}

class _LazyIndexedStackState extends State<LazyIndexedStack> {
  late Set<int> _built = {widget.index};

  @override
  void didUpdateWidget(LazyIndexedStack oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_built.contains(widget.index)) {
      _built = {..._built, widget.index};
    }
  }

  @override
  Widget build(BuildContext context) {
    final permanent = widget.keepAliveOnceVisited;
    return IndexedStack(
      index: widget.index,
      sizing: StackFit.expand,
      children: List.generate(widget.itemCount, (i) {
        if (!_built.contains(i)) {
          return const SizedBox.shrink();
        }
        final child = widget.itemBuilder(i);
        if (permanent.contains(i)) {
          return child;
        }
        return child;
      }),
    );
  }
}
