"""常见圣经英文专名 → 和合本/新译本惯用中文名。"""

from __future__ import annotations

# 高频人物、地点、民族（CUV/CNV 惯用译名）
NAME_ZH: dict[str, str] = {
    # 神与灵界
    "God": "神", "Lord": "主", "Holy Spirit": "圣灵", "Spirit": "圣灵",
    "Satan": "撒但", "Devil": "魔鬼", "Angel": "天使", "Cherub": "基路伯",
    # 族长与律法时代
    "Adam": "亚当", "Eve": "夏娃", "Cain": "该隐", "Abel": "亚伯", "Seth": "塞特",
    "Enoch": "以诺", "Noah": "挪亚", "Shem": "闪", "Ham": "含", "Japheth": "雅弗",
    "Abraham": "亚伯拉罕", "Abram": "亚伯兰", "Sarah": "撒拉", "Sarai": "撒莱",
    "Hagar": "夏甲", "Ishmael": "以实玛利", "Isaac": "以撒", "Rebekah": "利百加",
    "Jacob": "雅各", "Israel": "以色列", "Esau": "以扫", "Laban": "拉班",
    "Rachel": "拉结", "Leah": "利亚", "Joseph": "约瑟", "Benjamin": "便雅悯",
    "Judah": "犹大", "Reuben": "流便", "Simeon": "西缅", "Levi": "利未",
    "Dan": "但", "Naphtali": "拿弗他利", "Gad": "迦得", "Asher": "亚设",
    "Issachar": "以萨迦", "Zebulun": "西布伦", "Dinah": "底拿",
    "Potiphar": "波提乏", "Pharaoh": "法老",
    "Moses": "摩西", "Aaron": "亚伦", "Miriam": "米利暗", "Jethro": "叶忒罗",
    "Joshua": "约书亚", "Caleb": "迦勒", "Balaam": "巴兰", "Balak": "巴勒",
    "Korah": "可拉", "Dathan": "大坍", "Abiram": "亚比兰",
    # 士师与王国
    "Deborah": "底波拉", "Barak": "巴拉", "Gideon": "基甸", "Abimelech": "亚比米勒",
    "Jephthah": "耶弗他", "Samson": "参孙", "Delilah": "大利拉", "Ruth": "路得",
    "Naomi": "拿俄米", "Boaz": "波阿斯", "Samuel": "撒母耳", "Eli": "以利",
    "Hannah": "哈拿", "Saul": "扫罗", "Jonathan": "约拿单", "David": "大卫",
    "Goliath": "歌利亚", "Abigail": "亚比该", "Bathsheba": "拔示巴",
    "Absalom": "押沙龙", "Joab": "约押", "Abner": "押尼珥", "Uriah": "乌利亚",
    "Nathan": "拿单", "Solomon": "所罗门", "Rehoboam": "罗波安", "Jeroboam": "耶罗波安",
    "Ahab": "亚哈", "Jezebel": "耶洗别", "Elijah": "以利亚", "Elisha": "以利沙",
    "Naaman": "乃缦", "Jehu": "耶户", "Athaliah": "亚他利雅", "Joash": "约阿施",
    "Hezekiah": "希西家", "Manasseh": "玛拿西", "Josiah": "约西亚",
    "Nebuchadnezzar": "尼布甲尼撒", "Belshazzar": "伯沙撒", "Darius": "大利乌",
    "Cyrus": "居鲁士", "Artaxerxes": "亚达薛西", "Ahasuerus": "亚哈随鲁",
    "Esther": "以斯帖", "Mordecai": "末底改", "Haman": "哈曼", "Nehemiah": "尼希米",
    "Ezra": "以斯拉", "Zerubbabel": "所罗巴伯",
    # 先知
    "Isaiah": "以赛亚", "Jeremiah": "耶利米", "Ezekiel": "以西结", "Daniel": "但以理",
    "Hosea": "何西阿", "Joel": "约珥", "Amos": "阿摩司", "Obadiah": "俄巴底亚",
    "Jonah": "约拿", "Micah": "弥迦", "Nahum": "那鸿", "Habakkuk": "哈巴谷",
    "Zephaniah": "西番雅", "Haggai": "哈该", "Zechariah": "撒迦利亚", "Malachi": "玛拉基",
    "Job": "约伯", "Elihu": "以利户",
    # 新约人物
    "Jesus": "耶稣", "Christ": "基督", "Mary": "马利亚", "Joseph": "约瑟",
    "John": "约翰", "John the Baptist": "施洗约翰", "Peter": "彼得", "Simon": "西门",
    "Andrew": "安得烈", "James": "雅各", "Philip": "腓力", "Bartholomew": "巴多罗买",
    "Thomas": "多马", "Matthew": "马太", "Thaddaeus": "达太", "Judas": "犹大",
    "Judas Iscariot": "加略人犹大", "Matthias": "马提亚", "Paul": "保罗",
    "Saul of Tarsus": "扫罗", "Barnabas": "巴拿巴", "Timothy": "提摩太",
    "Titus": "提多", "Silas": "西拉", "Luke": "路加", "Mark": "马可",
    "Stephen": "司提反", "Philip the Evangelist": "腓利", "Cornelius": "哥尼流",
    "Lydia": "吕底亚", "Priscilla": "百基拉", "Aquila": "亚居拉", "Apollos": "亚波罗",
    "Nicodemus": "尼哥底母", "Lazarus": "拉撒路", "Martha": "马大",
    "Mary Magdalene": "抹大拉的马利亚", "Zacchaeus": "撒该", "Pilate": "彼拉多",
    "Herod": "希律", "Herodias": "希罗底", "Caiaphas": "该亚法", "Annas": "亚那",
    "Gamaliel": "迦玛列", "Ananias": "亚拿尼亚", "Sapphira": "撒非喇",
    "Dorcas": "多加", "Tabitha": "大比大", "Onesimus": "阿尼西母",
    "Philemon": "腓利门", "Epaphroditus": "以巴弗提", "Demas": "底马",
    "Agrippa": "亚基帕", "Felix": "腓力斯", "Festus": "非斯都",
    "Alphaeus": "亚勒腓", "Cleopas": "革流巴", "Emmaus": "以马忤斯",
    # 民族与群体
    "Amalek": "亚玛力", "Ammon": "亚扪", "Moab": "摩押", "Edom": "以东",
    "Philistine": "非利士人", "Canaanite": "迦南人", "Hittite": "赫人",
    "Amorite": "亚摩利人", "Jebusite": "耶布斯人", "Midian": "米甸",
    "Assyria": "亚述", "Babylon": "巴比伦", "Persia": "波斯", "Media": "玛代",
    "Greece": "希腊", "Rome": "罗马", "Gentile": "外邦人",
    # 地点
    "Jerusalem": "耶路撒冷", "Zion": "锡安", "Bethlehem": "伯利恒", "Nazareth": "拿撒勒",
    "Capernaum": "迦百农", "Galilee": "加利利", "Judea": "犹太", "Samaria": "撒玛利亚",
    "Jericho": "耶利哥", "Bethel": "伯特利", "Hebron": "希伯仑", "Beersheba": "别是巴",
    "Shechem": "示剑", "Shiloh": "示罗", "Gilgal": "吉甲", "Ai": "艾城",
    "Egypt": "埃及", "Goshen": "歌珊", "Sinai": "西奈", "Horeb": "何烈山",
    "Jordan": "约旦河", "Dead Sea": "死海", "Red Sea": "红海", "Nile": "尼罗河",
    "Euphrates": "幼发拉底河", "Tigris": "底格里斯河",
    "Damascus": "大马士革", "Tyre": "推罗", "Sidon": "西顿", "Nineveh": "尼尼微",
    "Babylon": "巴比伦", "Ur": "吾珥", "Haran": "哈兰", "Canaan": "迦南",
    "Gilead": "基列", "Bashan": "巴珊", "Moab": "摩押", "Edom": "以东",
    "Philistia": "非利士", "Gaza": "迦萨", "Ashdod": "亚实突", "Ashkelon": "亚实基伦",
    "Ekron": "以革伦", "Gath": "迦特", "Megiddo": "米吉多", "Carmel": "迦密",
    "Lebanon": "黎巴嫩", "Hermon": "黑门山", "Olivet": "橄榄山",
    "Mount of Olives": "橄榄山", "Gethsemane": "客西马尼", "Calvary": "髑髅地",
    "Golgotha": "各各他", "Bethany": "伯大尼", "Bethsaida": "伯赛大",
    "Chorazin": "哥拉汛", "Caesarea": "凯撒利亚", "Caesarea Philippi": "凯撒利亚腓立比",
    "Joppa": "约帕", "Lydda": "吕大", "Antioch": "安提阿",
    "Antioch (Syria)": "安提阿（叙利亚）", "Antioch (Pisidia)": "安提阿（彼西底）",
    "Tarsus": "大数", "Ephesus": "以弗所", "Corinth": "哥林多", "Athens": "雅典",
    "Philippi": "腓立比", "Thessalonica": "帖撒罗尼迦", "Berea": "庇哩亚",
    "Iconium": "以哥念", "Lystra": "路司得", "Derbe": "特庇", "Cyprus": "塞浦路斯",
    "Crete": "克里特", "Malta": "马耳他", "Rome": "罗马", "Colossae": "歌罗西",
    "Laodicea": "老底嘉", "Smyrna": "士每拿", "Pergamum": "别迦摩",
    "Thyatira": "推雅推喇", "Sardis": "撒狄", "Philadelphia": "非拉铁非",
    "Patmos": "拔摩", "Arabia": "阿拉伯", "Ethiopia": "埃塞俄比亚",
    "Cush": "古实", "Sheba": "示巴", "Tarshish": "他施", "Eden": "伊甸",
    "Sodom": "所多玛", "Gomorrah": "蛾摩拉", "Babel": "巴别",
    "Sea of Galilee": "加利利海", "Kidron": "汲沦溪", "Siloam": "西罗亚",
    "Pool of Bethesda": "毕士大池", "Temple": "圣殿", "Tabernacle": "会幕",
    "Achaia": "亚该亚", "Macedonia": "马其顿", "Asia": "亚西亚",
    "Alexandria": "亚历山大", "Areopagus": "亚略巴古",
    # 更多常见人名
    "Abiathar": "亚比亚他", "Abijah": "亚比雅", "Abishai": "亚比筛",
    "Achan": "亚干", "Achish": "亚吉", "Adonijah": "亚多尼雅",
    "Agag": "亚甲", "Ahaz": "亚哈斯", "Ahaziah": "亚哈谢", "Ahijah": "亚希雅",
    "Ahimelech": "亚希米勒", "Ahithophel": "亚希多弗", "Amaziah": "亚玛谢",
    "Amnon": "暗嫩", "Amon": "亚们", "Amoz": "亚摩斯", "Anak": "亚衲",
    "Anathoth": "亚拿突", "Aram": "亚兰", "Asa": "亚撒", "Asaph": "亚萨",
    "Balaam": "巴兰", "Barabbas": "巴拉巴", "Barak": "巴拉", "Baruch": "巴录",
    "Beelzebub": "别西卜", "Belial": "彼列", "Ben-hadad": "便哈达",
    "Bildad": "比勒达", "Boaz": "波阿斯", "Caiaphas": "该亚法",
    "Caleb": "迦勒", "Cyrus": "居鲁士", "Dagon": "大衮", "Delilah": "大利拉",
    "Ehud": "以笏", "Eleazar": "以利亚撒", "Eli": "以利", "Eliakim": "以利亚敬",
    "Eliezer": "以利以谢", "Elkanah": "以利加拿", "Enoch": "以诺",
    "Ephraim": "以法莲", "Esau": "以扫", "Ethan": "以探", "Eunice": "友尼基",
    "Eutychus": "犹推古", "Eve": "夏娃", "Gabriel": "加百列", "Gaius": "该犹",
    "Gehazi": "基哈西", "Gideon": "基甸", "Goliath": "歌利亚", "Hagar": "夏甲",
    "Haggai": "哈该", "Ham": "含", "Haman": "哈曼", "Hannah": "哈拿",
    "Hazael": "哈薛", "Heber": "希伯", "Hermes": "希耳米", "Herod": "希律",
    "Hezekiah": "希西家", "Hiram": "希兰", "Hophni": "何弗尼", "Hosea": "何西阿",
    "Huldah": "户勒大", "Hur": "户珥", "Hushai": "户筛", "Ichabod": "以迦博",
    "Isaac": "以撒", "Isaiah": "以赛亚", "Ishbosheth": "伊施波设",
    "Ishmael": "以实玛利", "Israel": "以色列", "Issachar": "以萨迦",
    "Jabin": "耶宾", "Jacob": "雅各", "Jael": "雅亿", "Jairus": "睚鲁",
    "James": "雅各", "Japheth": "雅弗", "Jason": "耶孙", "Jehoiada": "耶何耶大",
    "Jehoiakim": "约雅敬", "Jehoshaphat": "约沙法", "Jehu": "耶户",
    "Jephthah": "耶弗他", "Jeremiah": "耶利米", "Jeroboam": "耶罗波安",
    "Jesse": "耶西", "Jesus": "耶稣", "Jethro": "叶忒罗", "Jezebel": "耶洗别",
    "Joab": "约押", "Joash": "约阿施", "Job": "约伯", "Joel": "约珥",
    "John": "约翰", "Jonah": "约拿", "Jonathan": "约拿单", "Joram": "约兰",
    "Joseph": "约瑟", "Joshua": "约书亚", "Josiah": "约西亚", "Jotham": "约坦",
    "Judah": "犹大", "Judas": "犹大", "Jude": "犹大", "Korah": "可拉",
    "Laban": "拉班", "Lazarus": "拉撒路", "Leah": "利亚", "Levi": "利未",
    "Lois": "罗以", "Lot": "罗得", "Luke": "路加", "Lydia": "吕底亚",
    "Malachi": "玛拉基", "Manasseh": "玛拿西", "Mark": "马可", "Martha": "马大",
    "Mary": "马利亚", "Matthew": "马太", "Matthias": "马提亚", "Melchizedek": "麦基洗德",
    "Mephibosheth": "米非波设", "Merab": "米拉", "Methuselah": "玛土撒拉",
    "Micah": "弥迦", "Michael": "米迦勒", "Michal": "米甲", "Miriam": "米利暗",
    "Mordecai": "末底改", "Moses": "摩西", "Naaman": "乃缦", "Nabal": "拿八",
    "Naboth": "拿伯", "Nahum": "那鸿", "Naomi": "拿俄米", "Naphtali": "拿弗他利",
    "Nathan": "拿单", "Nathanael": "拿但业", "Nebuchadnezzar": "尼布甲尼撒",
    "Nehemiah": "尼希米", "Nicodemus": "尼哥底母", "Noah": "挪亚",
    "Obadiah": "俄巴底亚", "Omri": "暗利", "Onesimus": "阿尼西母",
    "Othniel": "俄陀聂", "Paul": "保罗", "Peter": "彼得", "Pharaoh": "法老",
    "Philemon": "腓利门", "Philip": "腓力", "Phinehas": "非尼哈",
    "Pilate": "彼拉多", "Potiphar": "波提乏", "Priscilla": "百基拉",
    "Rachel": "拉结", "Rahab": "喇合", "Rebekah": "利百加", "Rehoboam": "罗波安",
    "Reuben": "流便", "Ruth": "路得", "Samson": "参孙", "Samuel": "撒母耳",
    "Sapphira": "撒非喇", "Sarah": "撒拉", "Satan": "撒但", "Saul": "扫罗",
    "Seth": "塞特", "Shem": "闪", "Silas": "西拉", "Simeon": "西缅",
    "Simon": "西门", "Solomon": "所罗门", "Stephen": "司提反",
    "Thomas": "多马", "Timothy": "提摩太", "Titus": "提多", "Uriah": "乌利亚",
    "Uzziah": "乌西雅", "Zacchaeus": "撒该", "Zacharias": "撒迦利亚",
    "Zadok": "撒督", "Zebedee": "西庇太", "Zebulun": "西布伦",
    "Zechariah": "撒迦利亚", "Zedekiah": "西底家", "Zephaniah": "西番雅",
    "Zerubbabel": "所罗巴伯", "Zipporah": "西坡拉",
}

TYPE_ZH = {
    "person": "人物",
    "place": "地点",
    "term": "术语",
    "event": "事件",
}

FEATURE_ZH = {
    "City": "城邑",
    "Town": "城镇",
    "Village": "村庄",
    "Region": "地区",
    "Mountain": "山",
    "Hill": "山丘",
    "River": "河流",
    "Sea": "海",
    "Lake": "湖",
    "Valley": "山谷",
    "Desert": "旷野",
    "Island": "岛屿",
    "Place": "地点",
    "Country": "国家",
    "Nation": "民族",
    "Male": "男性",
    "Female": "女性",
}


def zh_name(name: str) -> str | None:
    """返回中文名；无法映射则 None。"""
    n = (name or "").strip()
    if not n:
        return None
    if any("\u4e00" <= c <= "\u9fff" for c in n):
        return n
    if n in NAME_ZH:
        return NAME_ZH[n]
    # 去括号注释再试：Antioch (Syria)
    base = n.split("(")[0].strip()
    if base in NAME_ZH:
        suffix = n[len(base):].strip()
        if suffix.startswith("(") and suffix.endswith(")"):
            inner = suffix[1:-1]
            inner_zh = NAME_ZH.get(inner, inner)
            return f"{NAME_ZH[base]}（{inner_zh}）"
        return NAME_ZH[base]
    return None
