package cn.prestoai.peiai

object HostConstants {
  const val HOST = "2sc.prestoai.cn"
  const val ORIGIN = "https://$HOST"
  const val DEFAULT_PATH = "/"

  /** H5 识别 Chrome Host 的 query 键 */
  const val Q_HOST = "peiai_host"
  const val Q_VN = "peiai_vn"
  const val Q_VC = "peiai_vc"
  const val HOST_VALUE = "chrome"

  /** peiai://host/v1/... */
  const val BRIDGE_SCHEME = "peiai"
  const val BRIDGE_HOST = "host"
}
