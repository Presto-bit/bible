/// 已合并至统一闯关页，保留路由兼容。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AiChallengeScreen extends StatelessWidget {
  const AiChallengeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (context.mounted) context.go('/challenge');
    });
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
