from viochem.patches import enable_batch_tracking, set_egp_symbol


def after_install():
	set_egp_symbol.execute()
	enable_batch_tracking.execute()
