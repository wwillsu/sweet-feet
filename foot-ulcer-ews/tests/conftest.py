import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def pytest_terminal_summary(terminalreporter):
    from pipeline.validate import format_summary, run_validation
    terminalreporter.write_line(format_summary(run_validation()))
