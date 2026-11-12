"""Sources tab, the readers that need Python. Prints lines.json rows ([{text, loc}]) on stdout.

  python read.py apk <file.apk>    static read of an Android app: package, version, name, permissions, screens.
                                   Nothing is installed or run (androguard parses the manifest and resources).
"""
import json
import sys


def apk(file):
    import logging
    from loguru import logger  # androguard logs through loguru; keep stdout clean for the JSON
    logger.remove(); logging.disable(logging.CRITICAL)
    from androguard.core.apk import APK
    a = APK(file)
    rows = [
        ('App name', a.get_app_name()), ('Package', a.get_package()),
        ('Version', f'{a.get_androidversion_name()} ({a.get_androidversion_code()})'),
        ('Min / target SDK', f'{a.get_min_sdk_version()} / {a.get_target_sdk_version()}'),
    ]
    out = [{'text': f'{k}: {v}', 'loc': 'manifest'} for k, v in rows if v]
    out += [{'text': f'Permission: {p}', 'loc': 'manifest'} for p in sorted(a.get_permissions())]
    out += [{'text': f'Screen: {s}', 'loc': 'manifest'} for s in a.get_activities()]
    return out


if __name__ == '__main__':
    cmd = sys.argv[1:2]
    if cmd == ['apk']: print(json.dumps(apk(sys.argv[2]), ensure_ascii=False))
    else: sys.exit(__doc__)
